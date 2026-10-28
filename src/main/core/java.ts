import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chmod, mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { promisify } from 'node:util'
import type { JavaInstall, JavaRuntimeOption } from '@shared/types'
import { downloadAll, fetchJson, type DownloadItem } from './http'
import { paths } from './paths'
import { javaRuntimePlatform } from './platform'

const execFileAsync = promisify(execFile)

// Mojang's own Java distribution index — the same one the official launcher uses.
const RUNTIME_INDEX =
  'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json'

const isWin = process.platform === 'win32'
const javaExe = isWin ? 'java.exe' : 'java'

interface RuntimeEntry {
  manifest: { sha1: string; size: number; url: string }
  version: { name: string; released: string }
}
type RuntimeIndex = Record<string, Record<string, RuntimeEntry[]>>

interface RuntimeManifest {
  files: Record<
    string,
    | { type: 'directory' }
    | { type: 'file'; executable?: boolean; downloads: { raw: { sha1: string; size: number; url: string } } }
    | { type: 'link'; target: string }
  >
}

// ---------------------------------------------------------------------------
// Probing
// ---------------------------------------------------------------------------

/** Run `java -XshowSettings:properties -version` and parse version + arch. */
export async function probeJava(exe: string, source: JavaInstall['source']): Promise<JavaInstall | null> {
  try {
    const { stderr } = await execFileAsync(exe, ['-XshowSettings:properties', '-version'], {
      timeout: 10_000,
      windowsHide: true
    })
    const version = /java\.version = (\S+)/.exec(stderr)?.[1] ?? /version "([^"]+)"/.exec(stderr)?.[1]
    if (!version) return null
    const arch = /os\.arch = (\S+)/.exec(stderr)?.[1] ?? 'unknown'
    return { path: exe, version, majorVersion: majorOf(version), arch, source }
  } catch {
    return null
  }
}

function majorOf(version: string): number {
  const parts = version.split(/[._+-]/).map(Number)
  return parts[0] === 1 ? parts[1] : parts[0]
}

async function subdirs(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => join(dir, d.name))
  } catch {
    return []
  }
}

/** Candidate Java homes in the usual install locations of each OS (like Prism's Java detection). */
async function candidateHomes(): Promise<string[]> {
  const homes: string[] = []
  if (process.env.JAVA_HOME) homes.push(process.env.JAVA_HOME)
  if (isWin) {
    for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA]) {
      if (!base) continue
      for (const vendor of ['Java', 'Eclipse Adoptium', 'Eclipse Foundation', 'AdoptOpenJDK', 'Zulu', 'Microsoft', 'BellSoft', 'Amazon Corretto', 'Semeru', 'Programs\\Eclipse Adoptium']) {
        homes.push(...(await subdirs(join(base, vendor))))
      }
    }
  } else if (process.platform === 'darwin') {
    for (const base of ['/Library/Java/JavaVirtualMachines', join(homedir(), 'Library/Java/JavaVirtualMachines')]) {
      for (const d of await subdirs(base)) homes.push(join(d, 'Contents/Home'))
    }
    homes.push('/opt/homebrew/opt/openjdk', '/usr/local/opt/openjdk')
  } else {
    for (const base of ['/usr/lib/jvm', '/usr/lib64/jvm', '/usr/java', '/opt/java', '/opt/jdk', '/opt/jdks']) {
      homes.push(...(await subdirs(base)))
    }
  }
  homes.push(...(await subdirs(join(homedir(), '.jdks'))))
  homes.push(...(await subdirs(join(homedir(), '.sdkman/candidates/java'))))
  return homes
}

/** Find every Java installation on this machine, plus runtimes this launcher has downloaded. */
export async function detectJava(): Promise<JavaInstall[]> {
  const exes = new Set<string>()
  for (const home of await candidateHomes()) {
    const exe = join(home, 'bin', javaExe)
    if (existsSync(exe)) exes.add(exe)
  }
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    const exe = join(dir, javaExe)
    if (dir && existsSync(exe)) exes.add(exe)
  }
  const managed = await listManagedRuntimes()
  const managedPaths = new Set(managed.map((m) => m.path))
  const system = await Promise.all([...exes].filter((e) => !managedPaths.has(e)).map((e) => probeJava(e, 'system')))
  // Dedupe symlinked duplicates (e.g. /usr/bin/java -> /usr/lib/jvm/...) by version+arch.
  const seen = new Set<string>()
  const unique = system.filter((j): j is JavaInstall => {
    if (!j) return false
    const key = `${j.version}|${j.arch}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return [...managed, ...unique].sort((a, b) => b.majorVersion - a.majorVersion)
}

// ---------------------------------------------------------------------------
// Managed runtimes downloaded from Mojang (HMCL-style one-click Java)
// ---------------------------------------------------------------------------

function runtimeHome(component: string): string {
  return join(paths.runtimes(), component)
}

function runtimeExe(component: string): string {
  const home = runtimeHome(component)
  if (process.platform === 'darwin') return join(home, 'jre.bundle/Contents/Home/bin/java')
  return join(home, 'bin', javaExe)
}

async function listManagedRuntimes(): Promise<JavaInstall[]> {
  const out: JavaInstall[] = []
  for (const dir of await subdirs(paths.runtimes())) {
    const component = dir.split(/[\\/]/).pop()!
    const exe = runtimeExe(component)
    if (!existsSync(exe) || !existsSync(join(dir, '.installed'))) continue
    const probed = await probeJava(exe, 'managed')
    if (probed) out.push(probed)
  }
  return out
}

let indexCache: RuntimeIndex | undefined

async function runtimeIndex(): Promise<RuntimeIndex> {
  if (!indexCache) indexCache = await fetchJson<RuntimeIndex>(RUNTIME_INDEX)
  return indexCache
}

/** Java runtimes Mojang publishes for this platform (Java 8, 17, 21, 25, ...). */
export async function availableRuntimes(): Promise<JavaRuntimeOption[]> {
  const index = await runtimeIndex()
  const platform = index[javaRuntimePlatform()] ?? {}
  const out: JavaRuntimeOption[] = []
  for (const [component, entries] of Object.entries(platform)) {
    const entry = entries[0]
    if (!entry || component === 'minecraft-java-exe') continue
    out.push({
      component,
      version: entry.version.name,
      majorVersion: majorOf(entry.version.name.replace(/^8u/, '1.8.')),
      installed: existsSync(join(runtimeHome(component), '.installed'))
    })
  }
  return out.sort((a, b) => b.majorVersion - a.majorVersion)
}

/** Download a Mojang Java runtime component (e.g. "java-runtime-delta" = Java 21). Returns the java executable. */
export async function installRuntime(
  component: string,
  concurrency: number,
  onProgress: (stage: string, done: number, total: number) => void
): Promise<string> {
  const home = runtimeHome(component)
  const marker = join(home, '.installed')
  const exe = runtimeExe(component)
  const index = await runtimeIndex()
  const entry = index[javaRuntimePlatform()]?.[component]?.[0]
  if (!entry) throw new Error(`Mojang does not provide ${component} for ${javaRuntimePlatform()}`)

  if (existsSync(marker) && (await readFile(marker, 'utf8')).trim() === entry.version.name && existsSync(exe)) {
    return exe
  }

  onProgress('Fetching runtime manifest', 0, 1)
  const manifest = await fetchJson<RuntimeManifest>(entry.manifest.url)
  const downloads: DownloadItem[] = []
  const executables: string[] = []
  const links: [string, string][] = []
  for (const [rel, file] of Object.entries(manifest.files)) {
    const dest = join(home, rel)
    if (file.type === 'directory') await mkdir(dest, { recursive: true })
    else if (file.type === 'file') {
      downloads.push({ url: file.downloads.raw.url, dest, sha1: file.downloads.raw.sha1, size: file.downloads.raw.size })
      if (file.executable) executables.push(dest)
    } else if (file.type === 'link') links.push([dest, file.target])
  }

  await rm(marker, { force: true })
  await downloadAll(downloads, concurrency, (d, t) => onProgress(`Downloading Java ${entry.version.name}`, d, t))
  if (!isWin) {
    for (const f of executables) await chmod(f, 0o755)
    for (const [dest, target] of links) {
      await mkdir(dirname(dest), { recursive: true })
      await rm(dest, { force: true })
      await symlink(target, dest).catch(() => undefined)
    }
  }
  await writeFile(marker, entry.version.name)
  return exe
}

/**
 * Pick a Java executable for a Minecraft version:
 * explicit path > Mojang runtime (auto-download) > best matching system Java.
 */
export async function resolveJava(opts: {
  explicitPath?: string
  component?: string
  majorVersion: number
  autoDownload: boolean
  concurrency: number
  onProgress: (stage: string, done: number, total: number) => void
}): Promise<string> {
  if (opts.explicitPath) {
    if (!existsSync(opts.explicitPath)) throw new Error(`Java not found at ${opts.explicitPath}`)
    return opts.explicitPath
  }
  const component = opts.component ?? (opts.majorVersion <= 8 ? 'jre-legacy' : undefined)
  if (component && existsSync(join(runtimeHome(component), '.installed')) && existsSync(runtimeExe(component))) {
    return runtimeExe(component)
  }
  if (component && opts.autoDownload) {
    try {
      return await installRuntime(component, opts.concurrency, opts.onProgress)
    } catch {
      // Fall through to system Java (e.g. platform not covered by Mojang's runtimes).
    }
  }
  const installs = await detectJava()
  // Modern versions run on newer Java; very old ones (Java 8) need an exact match.
  const match =
    installs.find((j) => j.majorVersion === opts.majorVersion) ??
    (opts.majorVersion > 8 ? installs.find((j) => j.majorVersion > opts.majorVersion) : undefined)
  if (!match) {
    throw new Error(
      `Java ${opts.majorVersion} is required. Enable automatic Java downloads or install it from the Java page.`
    )
  }
  return match.path
}
