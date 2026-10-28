import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { LoaderType, LoaderVersion } from '@shared/types'
import { fetchJson } from './http'
import { readJson, writeJson } from './fsutil'
import { paths } from './paths'
import type { Library } from './install'

// Prism Launcher's metadata server. It normalises every mod loader (Fabric, Quilt, Forge,
// NeoForge) into one component format, which is how Prism and its forks support them all.
export const PRISM_META = 'https://meta.prismlauncher.org/v1'

export const LOADER_UIDS: Record<Exclude<LoaderType, 'vanilla'>, string> = {
  fabric: 'net.fabricmc.fabric-loader',
  quilt: 'org.quiltmc.quilt-loader',
  forge: 'net.minecraftforge',
  neoforge: 'net.neoforged'
}
const INTERMEDIARY = 'net.fabricmc.intermediary'

interface IndexEntry {
  version: string
  recommended?: boolean
  releaseTime: string
  type?: string
  sha256: string
  requires?: { uid: string; equals?: string; suggests?: string }[]
}

/** One component file in Prism's "OneSix" format (only the fields we use). */
export interface Component {
  uid: string
  version: string
  mainClass?: string
  libraries?: Library[]
  '+libraries'?: Library[]
  mavenFiles?: Library[]
  minecraftArguments?: string
  '+tweakers'?: string[]
  '+jvmArgs'?: string[]
  '+traits'?: string[]
  requires?: IndexEntry['requires']
}

const indexCache = new Map<string, { at: number; versions: IndexEntry[] }>()
const INDEX_TTL = 10 * 60_000

async function index(uid: string): Promise<IndexEntry[]> {
  const cached = indexCache.get(uid)
  if (cached && Date.now() - cached.at < INDEX_TTL) return cached.versions
  const file = join(paths.cache(), 'meta', uid, 'index.json')
  try {
    const data = await fetchJson<{ versions: IndexEntry[] }>(`${PRISM_META}/${uid}/index.json`)
    await writeJson(file, data)
    indexCache.set(uid, { at: Date.now(), versions: data.versions })
    return data.versions
  } catch (err) {
    // Offline: fall back to the last index we saw.
    const data = await readJson<{ versions: IndexEntry[] } | null>(file, null)
    if (!data) throw err
    return data.versions
  }
}

/** Download a component version, verified against the sha256 in its index and cached on disk. */
export async function component(uid: string, version: string): Promise<Component> {
  const file = join(paths.cache(), 'meta', uid, `${version}.json`)
  const entry = (await index(uid).catch(() => [])).find((v) => v.version === version)
  if (existsSync(file)) {
    const raw = await readFile(file)
    if (!entry || createHash('sha256').update(raw).digest('hex') === entry.sha256) return JSON.parse(raw.toString()) as Component
  }
  const res = await fetch(`${PRISM_META}/${uid}/${version}.json`)
  if (!res.ok) throw new Error(`${uid} ${version} is not available (HTTP ${res.status})`)
  const raw = Buffer.from(await res.arrayBuffer())
  if (entry && createHash('sha256').update(raw).digest('hex') !== entry.sha256) {
    throw new Error(`Checksum mismatch for ${uid} ${version}`)
  }
  await writeJson(file, JSON.parse(raw.toString()))
  return JSON.parse(raw.toString()) as Component
}

/** Loader versions that work with a Minecraft version, newest first. */
export async function loaderVersions(type: Exclude<LoaderType, 'vanilla'>, mcVersion: string): Promise<LoaderVersion[]> {
  const uid = LOADER_UIDS[type]
  if (type === 'fabric' || type === 'quilt') {
    // Fabric and Quilt loaders are version-independent; they need intermediary mappings for the game version.
    const mappings = await index(INTERMEDIARY)
    if (!mappings.some((m) => m.version === mcVersion)) return []
  }
  const versions = await index(uid)
  return versions
    .filter((v) => type === 'fabric' || type === 'quilt' || v.requires?.some((r) => r.uid === 'net.minecraft' && r.equals === mcVersion))
    .map((v) => ({
      version: v.version,
      recommended: !!v.recommended,
      releaseTime: v.releaseTime,
      stable: !/alpha|beta|pre|rc/i.test(v.version) && (v.type === undefined || v.type === 'release')
    }))
}

/** All components needed for a loader, in the order they must be applied over vanilla. */
export async function loaderComponents(loader: { type: Exclude<LoaderType, 'vanilla'>; version: string }, mcVersion: string): Promise<Component[]> {
  const main = await component(LOADER_UIDS[loader.type], loader.version)
  if (loader.type === 'fabric' || loader.type === 'quilt') return [await component(INTERMEDIARY, mcVersion), main]
  return [main]
}
