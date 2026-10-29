import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { chmod, mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { promisify } from 'node:util'
import type { JavaInstall, JavaRuntimeOption } from '@shared/types'
import { downloadAll, fetchJson, type DownloadItem } from './http'
import { extractArchive } from './archive'
import { PRISM_META } from './meta'
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
// Managed runtimes: Mojang's own builds first (like the official launcher and HMCL),
// Eclipse Temurin from Prism's metadata for platforms/versions Mojang doesn't cover
// (e.g. Linux ARM64), like Prism Launcher's Java auto-install.
// ---------------------------------------------------------------------------

const ADOPTIUM_PREFIX = 'adoptium-'

function runtimeHome(component: string): string {
  return join(paths.runtimes(), component)
}

function runtimeExe(component: string): string {
  const home = runtimeHome(component)
  const recorded = join(home, '.java-path')
  if (existsSync(recorded)) return join(home, readFileSync(recorded, 'utf8').trim())
  if (process.platform === 'darwin') return join(home, 'jre.bundle/Contents/Home/bin/java')
  return join(home, 'bin', javaExe)
}

function isInstalled(component: string): boolean {
  return existsSync(join(runtimeHome(component), '.installed')) && existsSync(runtimeExe(component))
}

async function listManagedRuntimes(): Promise<JavaInstall[]> {
  const out: JavaInstall[] = []
  for (const dir of await subdirs(paths.runtimes())) {
    const component = dir.split(/[\\/]/).pop()!
    if (!isInstalled(component)) continue
    const probed = await probeJava(runtimeExe(component), 'managed')
    if (probed) out.push(probed)
  }
  return out
}

let indexCache: RuntimeIndex | undefined

async function runtimeIndex(): Promise<RuntimeIndex> {
  if (!indexCache) indexCache = await fetchJson<RuntimeIndex>(RUNTIME_INDEX)
  return indexCache
}

interface AdoptiumRuntime {
  name: string
  url: string
  runtimeOS: string
  packageType: 'jre' | 'jdk'
  downloadType: 'archive' | 'manifest'
  checksum: { type: string; hash: string }
  version: { major: number; minor: number; security: number; build: number }
}

function adoptiumPlatform(): string {
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'riscv64' ? 'riscv64' : 'x64'
  const os = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac-os' : 'linux'
  return `${os}-${arch}`
}

async function adoptiumMajors(): Promise<number[]> {
  const idx = await fetchJson<{ versions: { version: string }[] }>(`${PRISM_META}/net.adoptium.java/index.json`)
  return idx.versions.map((v) => Number(v.version.replace('java', ''))).filter((n) => n > 0)
}

async function adoptiumRuntime(major: number): Promise<AdoptiumRuntime | undefined> {
  const data = await fetchJson<{ runtimes: AdoptiumRuntime[] }>(`${PRISM_META}/net.adoptium.java/java${major}.json`)
  const candidates = data.runtimes.filter((r) => r.runtimeOS === adoptiumPlatform() && r.downloadType === 'archive')
  // Prefer the smaller JRE package, newest build first.
  const score = (r: AdoptiumRuntime) => [r.packageType === 'jre' ? 1 : 0, r.version.minor, r.version.security, r.version.build]
  return candidates.sort((a, b) => {
    const sa = score(a)
    const sb = score(b)
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sb[i] - sa[i]
    return 0
  })[0]
}

const adoptiumVersion = (r: AdoptiumRuntime) => `${r.version.major}.${r.version.minor}.${r.version.security}+${r.version.build}`

/** Java runtimes available for one-click download on this platform, one per major version. */
export async function availableRuntimes(): Promise<JavaRuntimeOption[]> {
  const byMajor = new Map<number, JavaRuntimeOption & { released: string }>()
  const index = await runtimeIndex().catch(() => ({}) as RuntimeIndex)
  // Mojang publishes several components with the same major version (e.g. three Java 17 builds);
  // show one per major version, preferring one that is already installed, then the newest.
  for (const [component, entries] of Object.entries(index[javaRuntimePlatform()] ?? {})) {
    const entry = entries[0]
    if (!entry || component === 'minecraft-java-exe') continue
    const option = {
      component,
      vendor: 'mojang' as const,
      version: entry.version.name,
      majorVersion: majorOf(entry.version.name.replace(/^8u/, '1.8.')),
      installed: isInstalled(component),
      released: entry.version.released
    }
    const prev = byMajor.get(option.majorVersion)
    const better =
      !prev || (option.installed && !prev.installed) || (option.installed === prev.installed && option.released > prev.released)
    if (better) byMajor.set(option.majorVersion, option)
  }
  // Fill the gaps (other platforms, newer Java versions) with Eclipse Temurin: LTS releases plus the newest one.
  const majors = await adoptiumMajors().catch(() => [] as number[])
  const newest = Math.max(0, ...majors)
  for (const major of majors) {
    if (byMajor.has(major) || major < 8 || (![8, 11, 17, 21, 25].includes(major) && major !== newest)) continue
    byMajor.set(major, {
      component: `${ADOPTIUM_PREFIX}${major}`,
      vendor: 'adoptium',
      version: `Temurin ${major}`,
      majorVersion: major,
      installed: isInstalled(`${ADOPTIUM_PREFIX}${major}`),
      released: ''
    })
  }
  return [...byMajor.values()].map(({ released: _, ...o }) => o).sort((a, b) => b.majorVersion - a.majorVersion)
}

type Progress = (stage: string, done: number, total: number) => void

/**
 * Downloads in progress, keyed by runtime. A second request for the same runtime (e.g. pressing Play
 * while the background download started at instance creation is still running) joins the first one
 * and receives its progress instead of writing the same files twice.
 */
const inflight = new Map<string, { promise: Promise<string>; listeners: Set<Progress> }>()

function shared(key: string, onProgress: Progress, run: (progress: Progress) => Promise<string>): Promise<string> {
  let entry = inflight.get(key)
  if (!entry) {
    const listeners = new Set<Progress>()
    const promise = run((s, d, t) => listeners.forEach((l) => l(s, d, t))).finally(() => inflight.delete(key))
    entry = { promise, listeners }
    inflight.set(key, entry)
  }
  entry.listeners.add(onProgress)
  return entry.promise
}

function installMojangRuntime(component: string, concurrency: number, onProgress: Progress): Promise<string> {
  return shared(component, onProgress, (progress) => downloadMojangRuntime(component, concurrency, progress))
}

function installAdoptium(major: number, onProgress: Progress): Promise<string> {
  return shared(`${ADOPTIUM_PREFIX}${major}`, onProgress, (progress) => downloadAdoptium(major, progress))
}

async function downloadMojangRuntime(component: string, concurrency: number, onProgress: Progress): Promise<string> {
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

async function downloadAdoptium(major: number, onProgress: Progress): Promise<string> {
  const component = `${ADOPTIUM_PREFIX}${major}`
  const home = runtimeHome(component)
  onProgress(`Finding Java ${major}`, 0, 1)
  const runtime = await adoptiumRuntime(major)
  if (!runtime) throw new Error(`No Java ${major} build is available for ${adoptiumPlatform()}`)
  if (isInstalled(component) && (await readFile(join(home, '.installed'), 'utf8')).trim() === runtime.name) {
    return runtimeExe(component)
  }
  const archive = join(paths.cache(), 'java', decodeURIComponent(runtime.url.split('/').pop()!))
  const algo = runtime.checksum.type === 'sha256' ? { sha256: runtime.checksum.hash } : runtime.checksum.type === 'sha1' ? { sha1: runtime.checksum.hash } : {}
  await downloadAll([{ url: runtime.url, dest: archive, ...algo }], 1, () =>
    onProgress(`Downloading Java ${adoptiumVersion(runtime)} (Temurin)`, 0, 1)
  )
  onProgress(`Extracting Java ${adoptiumVersion(runtime)}`, 0, 1)
  await rm(home, { recursive: true, force: true })
  await extractArchive(archive, home, 1)
  const rel = [join('bin', javaExe), join('Contents', 'Home', 'bin', javaExe)].find((r) => existsSync(join(home, r)))
  if (!rel) throw new Error('Downloaded Java archive has an unexpected layout')
  await writeFile(join(home, '.java-path'), rel)
  await writeFile(join(home, '.installed'), runtime.name)
  await rm(archive, { force: true })
  return join(home, rel)
}

/** Download a runtime by component id: a Mojang component (e.g. "java-runtime-delta") or "adoptium-<major>". */
export async function installRuntime(component: string, concurrency: number, onProgress: Progress): Promise<string> {
  if (component.startsWith(ADOPTIUM_PREFIX)) return installAdoptium(Number(component.slice(ADOPTIUM_PREFIX.length)), onProgress)
  return installMojangRuntime(component, concurrency, onProgress)
}

/**
 * Pick a Java executable for a Minecraft version:
 * explicit path > downloaded runtime > auto-download (Mojang, then Temurin) > best matching system Java.
 */
export async function resolveJava(opts: {
  explicitPath?: string
  component?: string
  majorVersion: number
  autoDownload: boolean
  concurrency: number
  onProgress: Progress
}): Promise<string> {
  if (opts.explicitPath) {
    if (!existsSync(opts.explicitPath)) throw new Error(`Java not found at ${opts.explicitPath}`)
    return opts.explicitPath
  }
  const component = opts.component ?? (opts.majorVersion <= 8 ? 'jre-legacy' : undefined)
  if (component && isInstalled(component)) return runtimeExe(component)
  // Any other downloaded runtime with the same major version works too (e.g. Java 17 "gamma" vs "beta").
  const managedSameMajor = (await listManagedRuntimes()).find((j) => j.majorVersion === opts.majorVersion)
  if (managedSameMajor) return managedSameMajor.path
  if (opts.autoDownload) {
    if (component) {
      try {
        return await installMojangRuntime(component, opts.concurrency, opts.onProgress)
      } catch {
        // Not provided by Mojang for this platform: try Temurin next.
      }
    }
    try {
      return await installAdoptium(opts.majorVersion, opts.onProgress)
    } catch {
      // Fall through to system Java.
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
