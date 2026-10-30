import { app } from 'electron'
import { join } from 'node:path'
import type { LoaderType } from '@shared/types'
import type { MessageKey } from '@shared/i18n'
import { downloadAll, fetchJson } from './http'
import { tr } from './i18n'
import { paths } from './paths'

// Mods made alongside Puma Launcher (mods/ in its repository). They aren't on Modrinth: their jars are attached to
// the launcher's own GitHub releases, and every download is checked against the SHA-256 digest GitHub publishes.

const RELEASES = 'https://api.github.com/repos/txtaan/Puma-Launcher-Minecraft/releases'

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
}

export const PUMA_MODS: PumaMod[] = [
  {
    id: 'puma:polymarket-billboard',
    slug: 'polymarket-billboard',
    title: 'Polymarket Billboard',
    description: 'mods.polymarketDescription',
    loader: 'forge',
    mcVersions: ['26.3'],
    asset: /^polymarket-billboard-[\w.+-]+\.jar$/
  }
]

export const pumaMod = (id: string): PumaMod | undefined => PUMA_MODS.find((m) => m.id === id)

/** Puma mods that run on this loader and Minecraft version. */
export function pumaModsFor(loader: LoaderType | undefined, mcVersion: string): PumaMod[] {
  return PUMA_MODS.filter((m) => m.loader === loader && m.mcVersions.includes(mcVersion))
}

interface ReleaseAsset {
  name: string
  browser_download_url: string
  size: number
  digest?: string | null
}

/** The mod's jar in this launcher version's release (built together with it), or else in the newest release. */
async function findJar(mod: PumaMod): Promise<{ name: string; url: string; size: number; sha256: string }> {
  for (const url of [`${RELEASES}/tags/v${app.getVersion()}`, `${RELEASES}/latest`]) {
    const release = await fetchJson<{ assets: ReleaseAsset[] }>(url).catch(() => null)
    const asset = release?.assets.find((a) => mod.asset.test(a.name))
    if (!asset) continue
    if (!asset.digest?.startsWith('sha256:')) throw new Error(tr('error.pumaModUnverified', { title: mod.title }))
    return { name: asset.name, url: asset.browser_download_url, size: asset.size, sha256: asset.digest.slice('sha256:'.length) }
  }
  throw new Error(tr('error.pumaModMissing', { title: mod.title }))
}

/** Download (or reuse, if already verified) the mod's jar in the launcher's cache. */
export async function fetchPumaJar(mod: PumaMod): Promise<{ file: string; name: string }> {
  const jar = await findJar(mod)
  const file = join(paths.cache(), 'puma-mods', jar.name)
  await downloadAll([{ url: jar.url, dest: file, sha256: jar.sha256, size: jar.size }], 1, () => undefined)
  return { file, name: jar.name }
}
