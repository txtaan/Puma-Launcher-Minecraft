import { app } from 'electron'
import { join } from 'node:path'
import type { LoaderType } from '@shared/types'
import type { MessageKey } from '@shared/i18n'
import { USER_AGENT, downloadAll, fetchJson } from './http'
import { tr } from './i18n'
import { paths } from './paths'

// Mods made alongside Puma Launcher (mods/ in its repository). They aren't on Modrinth: their jars are attached to
// the launcher's own GitHub releases, with a puma-mods.json listing each jar's SHA-256, and every download is checked.

const REPO = 'txtaan/Puma-Launcher-Minecraft'
const DOWNLOADS = `https://github.com/${REPO}/releases`
const API = `https://api.github.com/repos/${REPO}/releases`

export interface PumaMod {
  /** Used where a Modrinth project id would be: "puma:<slug>". */
  id: string
  slug: string
  title: string
  description: MessageKey
  loader: Exclude<LoaderType, 'vanilla'>
  mcVersions: string[]
  /** The jar's name among the release assets. */
  asset: RegExp
  /** Earlier ids and jar names of the same mod: installing it replaces them. */
  formerly?: { id: string; asset: RegExp }[]
}

export const PUMA_MODS: PumaMod[] = [
  {
    id: 'puma:polymarket-prediction-market',
    slug: 'polymarket-prediction-market',
    title: 'Polymarket Prediction Market',
    description: 'mods.polymarketDescription',
    loader: 'forge',
    mcVersions: ['26.3'],
    asset: /^polymarket-prediction-market-[\w.+-]+\.jar$/,
    // Released as "Polymarket Billboard" with Puma Launcher 0.4.0-0.4.2.
    formerly: [{ id: 'puma:polymarket-billboard', asset: /^polymarket-billboard-[\w.+-]+\.jar$/ }]
  }
]

export const pumaMod = (id: string): PumaMod | undefined =>
  PUMA_MODS.find((m) => m.id === id || m.formerly?.some((f) => f.id === id))

/** Every id the mod has had, current first. */
export const pumaIds = (mod: PumaMod): string[] => [mod.id, ...(mod.formerly ?? []).map((f) => f.id)]

/** Puma mods that run on this loader and Minecraft version. */
export function pumaModsFor(loader: LoaderType | undefined, mcVersion: string): PumaMod[] {
  return PUMA_MODS.filter((m) => m.loader === loader && m.mcVersions.includes(mcVersion))
}

/** puma-mods.json, written next to the jars by the release workflow. */
interface Manifest {
  mods: { id: string; file: string; sha256: string; size: number }[]
}

interface ReleaseAsset {
  name: string
  browser_download_url: string
  size: number
  digest?: string | null
}

type Jar = { name: string; url: string; size: number; sha256: string }

/** The mod's jar in this launcher version's release (built together with it), or else in the newest release. */
async function findJar(mod: PumaMod): Promise<Jar> {
  const tags = [`v${app.getVersion()}`, 'latest']
  // First the release's puma-mods.json: a plain release download, which GitHub doesn't rate-limit like its API.
  for (const tag of tags) {
    const base = tag === 'latest' ? `${DOWNLOADS}/latest/download` : `${DOWNLOADS}/download/${tag}`
    const manifest = await fetchJson<Manifest>(`${base}/puma-mods.json`).catch(() => null)
    const entry = manifest?.mods?.find((m) => m.id === mod.id && mod.asset.test(m.file))
    if (entry && /^[0-9a-f]{64}$/.test(entry.sha256)) {
      return { name: entry.file, url: `${base}/${entry.file}`, size: entry.size, sha256: entry.sha256 }
    }
  }
  // Releases without it (0.4.0): GitHub's API, which lists every asset's SHA-256 digest.
  let limited = false
  for (const tag of tags) {
    const res = await fetch(tag === 'latest' ? `${API}/latest` : `${API}/tags/${tag}`, { headers: { 'User-Agent': USER_AGENT } }).catch(() => null)
    if (res?.status === 403 || res?.status === 429) limited = true
    if (!res?.ok) continue
    const asset = ((await res.json()) as { assets: ReleaseAsset[] }).assets.find((a) => mod.asset.test(a.name))
    if (!asset) continue
    if (!asset.digest?.startsWith('sha256:')) throw new Error(tr('error.pumaModUnverified', { title: mod.title }))
    return { name: asset.name, url: asset.browser_download_url, size: asset.size, sha256: asset.digest.slice('sha256:'.length) }
  }
  throw new Error(tr(limited ? 'error.githubRateLimited' : 'error.pumaModMissing', { title: mod.title }))
}

/** Download (or reuse, if already verified) the mod's jar in the launcher's cache. */
export async function fetchPumaJar(mod: PumaMod): Promise<{ file: string; name: string }> {
  const jar = await findJar(mod)
  const file = join(paths.cache(), 'puma-mods', jar.name)
  await downloadAll([{ url: jar.url, dest: file, sha256: jar.sha256, size: jar.size }], 1, () => undefined)
  return { file, name: jar.name }
}
