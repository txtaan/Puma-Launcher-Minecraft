import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { downloadAll, fetchJson, type DownloadItem } from './http'
import { readJson, writeJson } from './fsutil'
import { paths } from './paths'
import { mojangArch, mojangOs, rulesAllow, type Rule } from './platform'
import { findVersion } from './versions'

// ---------------------------------------------------------------------------
// Version JSON model (subset of Mojang's format, plus Fabric/Quilt style libraries)
// ---------------------------------------------------------------------------

export interface Artifact {
  path: string
  sha1?: string
  size?: number
  url: string
}

export interface Library {
  name: string
  url?: string
  rules?: Rule[]
  downloads?: { artifact?: Artifact; classifiers?: Record<string, Artifact> }
  natives?: Record<string, string>
  extract?: { exclude?: string[] }
}

export type Argument = string | { rules?: Rule[]; value: string | string[] }

export interface VersionJson {
  id: string
  type: string
  inheritsFrom?: string
  mainClass: string
  jar?: string
  minecraftArguments?: string
  arguments?: { game?: Argument[]; jvm?: Argument[]; 'default-user-jvm'?: Argument[] }
  libraries: Library[]
  assetIndex?: { id: string; sha1: string; size: number; totalSize?: number; url: string }
  assets?: string
  downloads?: { client?: Artifact & { path?: string } }
  javaVersion?: { component: string; majorVersion: number }
  logging?: { client?: { argument: string; file: { id: string; sha1: string; size: number; url: string } } }
}

interface AssetIndex {
  objects: Record<string, { hash: string; size: number }>
  virtual?: boolean
  map_to_resources?: boolean
}

/** Convert a maven coordinate "group:artifact:version[:classifier][@ext]" to a repository path. */
export function mavenPath(name: string): string {
  const [coords, ext = 'jar'] = name.split('@')
  const [group, artifact, version, classifier] = coords.split(':')
  const file = `${artifact}-${version}${classifier ? `-${classifier}` : ''}.${ext}`
  return `${group.replace(/\./g, '/')}/${artifact}/${version}/${file}`
}

/** Download (if needed) and read a single version JSON. Local custom versions are used as-is. */
async function loadVersionJson(id: string): Promise<VersionJson> {
  const file = paths.versionJson(id)
  const summary = await findVersion(id).catch(() => undefined)
  if (summary) {
    const local = await readJson<VersionJson | null>(file, null)
    if (local && existsSync(`${file}.sha1`) && (await readFile(`${file}.sha1`, 'utf8')) === summary.sha1) return local
    const remote = await fetchJson<VersionJson>(summary.url)
    await writeJson(file, remote)
    await writeFile(`${file}.sha1`, summary.sha1)
    return remote
  }
  const local = await readJson<VersionJson | null>(file, null)
  if (!local) throw new Error(`Version ${id} is not available. Check your internet connection.`)
  return local
}

/** Resolve `inheritsFrom` chains (used by Fabric, Quilt, Forge profiles) into one merged version. */
export async function resolveVersion(id: string): Promise<VersionJson> {
  const child = await loadVersionJson(id)
  if (!child.inheritsFrom) return child
  const parent = await resolveVersion(child.inheritsFrom)
  return {
    ...parent,
    ...child,
    jar: child.jar ?? parent.jar ?? parent.id,
    libraries: [...child.libraries, ...parent.libraries],
    arguments:
      child.arguments || parent.arguments
        ? {
            game: [...(parent.arguments?.game ?? []), ...(child.arguments?.game ?? [])],
            jvm: [...(parent.arguments?.jvm ?? []), ...(child.arguments?.jvm ?? [])],
            'default-user-jvm': child.arguments?.['default-user-jvm'] ?? parent.arguments?.['default-user-jvm']
          }
        : undefined,
    minecraftArguments: child.minecraftArguments ?? parent.minecraftArguments,
    assetIndex: child.assetIndex ?? parent.assetIndex,
    assets: child.assets ?? parent.assets,
    downloads: child.downloads ?? parent.downloads,
    javaVersion: child.javaVersion ?? parent.javaVersion,
    logging: child.logging ?? parent.logging
  }
}

/** Native classifier for a legacy (LWJGL 2 era) library on this OS, if any. */
export function nativeClassifier(lib: Library): string | undefined {
  const key = lib.natives?.[mojangOs()]
  return key?.replace('${arch}', mojangArch() === 'x86' ? '32' : '64')
}

function libraryArtifact(lib: Library): Artifact | undefined {
  if (lib.downloads?.artifact) return lib.downloads.artifact
  if (lib.downloads) return undefined
  // Fabric/Quilt style: only maven coordinates + repository URL.
  const path = mavenPath(lib.name)
  const base = (lib.url ?? 'https://libraries.minecraft.net/').replace(/\/?$/, '/')
  return { path, url: base + path }
}

export function activeLibraries(version: VersionJson): Library[] {
  return version.libraries.filter((l) => rulesAllow(l.rules))
}

/** Classpath entries for a resolved version, deduplicated with the most specific (child) library winning. */
export function classpath(version: VersionJson): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const lib of activeLibraries(version)) {
    const art = libraryArtifact(lib)
    if (!art) continue
    const [group, artifact, , classifier] = lib.name.split(':')
    const key = `${group}:${artifact}:${classifier ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(join(paths.libraries(), art.path))
  }
  out.push(paths.versionJar(version.jar ?? version.id))
  return out
}

export function assetIndexId(version: VersionJson): string {
  return version.assetIndex?.id ?? version.assets ?? 'legacy'
}

/** Where `${game_assets}` points: the virtual asset dir for very old versions. */
export function legacyAssetsDir(version: VersionJson, gameDir: string, index: AssetIndex | null): string {
  if (index?.map_to_resources) return join(gameDir, 'resources')
  return join(paths.assets(), 'virtual', assetIndexId(version))
}

export async function readAssetIndex(version: VersionJson): Promise<AssetIndex | null> {
  return readJson<AssetIndex | null>(join(paths.assets(), 'indexes', `${assetIndexId(version)}.json`), null)
}

export function logConfigPath(version: VersionJson): string | undefined {
  const file = version.logging?.client?.file
  return file ? join(paths.assets(), 'log_configs', file.id) : undefined
}

/**
 * Make sure everything needed to launch a version is on disk:
 * client jar, libraries, natives, asset index + objects and the log4j config.
 */
export async function installVersion(
  id: string,
  gameDir: string,
  concurrency: number,
  onProgress: (stage: string, done: number, total: number) => void
): Promise<VersionJson> {
  onProgress('Resolving version', 0, 1)
  const version = await resolveVersion(id)
  const files: DownloadItem[] = []

  const jarId = version.jar ?? version.id
  const client = version.downloads?.client
  if (client) files.push({ url: client.url, dest: paths.versionJar(jarId), sha1: client.sha1, size: client.size })
  else if (!existsSync(paths.versionJar(jarId))) throw new Error(`No client download for ${jarId}`)

  for (const lib of activeLibraries(version)) {
    const art = libraryArtifact(lib)
    if (art) files.push({ url: art.url, dest: join(paths.libraries(), art.path), sha1: art.sha1, size: art.size })
    const classifier = nativeClassifier(lib)
    const native = classifier ? lib.downloads?.classifiers?.[classifier] : undefined
    if (native) files.push({ url: native.url, dest: join(paths.libraries(), native.path), sha1: native.sha1, size: native.size })
  }

  const logging = version.logging?.client?.file
  if (logging) files.push({ url: logging.url, dest: logConfigPath(version)!, sha1: logging.sha1, size: logging.size })

  await downloadAll(files, concurrency, (d, t) => onProgress('Downloading game files', d, t))

  if (version.assetIndex) {
    const indexFile = join(paths.assets(), 'indexes', `${version.assetIndex.id}.json`)
    await downloadAll(
      [{ url: version.assetIndex.url, dest: indexFile, sha1: version.assetIndex.sha1, size: version.assetIndex.size }],
      1,
      () => onProgress('Downloading asset index', 0, 1)
    )
    const index = JSON.parse(await readFile(indexFile, 'utf8')) as AssetIndex
    const objects = Object.values(index.objects).map<DownloadItem>((o) => ({
      url: `https://resources.download.minecraft.net/${o.hash.slice(0, 2)}/${o.hash}`,
      dest: join(paths.assets(), 'objects', o.hash.slice(0, 2), o.hash),
      sha1: o.hash,
      size: o.size
    }))
    await downloadAll(objects, concurrency, (d, t) => onProgress('Downloading assets', d, t))

    // Pre-1.7 versions read assets from a flat folder instead of the hashed object store.
    if (index.virtual || index.map_to_resources) {
      const target = legacyAssetsDir(version, gameDir, index)
      const entries = Object.entries(index.objects)
      let done = 0
      for (const [name, o] of entries) {
        const dest = join(target, name)
        if (!existsSync(dest)) {
          await mkdir(dirname(dest), { recursive: true })
          await copyFile(join(paths.assets(), 'objects', o.hash.slice(0, 2), o.hash), dest)
        }
        onProgress('Preparing legacy assets', ++done, entries.length)
      }
    }
  }

  return version
}
