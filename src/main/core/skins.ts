import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Account, RawSkin, SkinEntry, SkinLibrary, SkinModel, SkinSaveInput } from '@shared/types'
import { fetchJson, USER_AGENT } from './http'
import { readJson, writeJson } from './fsutil'
import { tr } from './i18n'
import { paths } from './paths'

// The skin library: one PNG per skin (plus the same skin converted to the other arm width) and an index with names,
// models and which skin each account wears. Images are prepared in the renderer, which has a canvas; the main process
// only checks that they are 64×64 PNGs and stores them.

type StoredSkin = Omit<SkinEntry, 'png' | 'alternate'>
interface SkinIndex {
  skins: StoredSkin[]
  equipped: Record<string, string>
}

const indexFile = () => join(paths.skins(), 'index.json')
const pngFile = (id: string) => join(paths.skins(), `${id}.png`)
const alternateFile = (id: string) => join(paths.skins(), `${id}.alt.png`)

async function loadIndex(): Promise<SkinIndex> {
  const index = await readJson<SkinIndex>(indexFile(), { skins: [], equipped: {} })
  return { skins: index.skins ?? [], equipped: index.equipped ?? {} }
}

async function saveIndex(index: SkinIndex): Promise<void> {
  await mkdir(paths.skins(), { recursive: true })
  await writeJson(indexFile(), index)
}

const toDataUrl = (png: Buffer) => `data:image/png;base64,${png.toString('base64')}`

/** Decode a PNG data URL and check it is a 64×64 PNG (the only size Minecraft accepts for modern skins). */
function decodeSkinPng(dataUrl: string): Buffer {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  const png = match ? Buffer.from(match[1], 'base64') : Buffer.alloc(0)
  const isPng = png.length > 24 && png.subarray(1, 4).toString('ascii') === 'PNG' && png.subarray(12, 16).toString('ascii') === 'IHDR'
  if (!isPng || png.readUInt32BE(16) !== 64 || png.readUInt32BE(20) !== 64 || png.length > 256 * 1024) {
    throw new Error(tr('skins.error.invalid'))
  }
  return png
}

export async function listSkins(): Promise<SkinLibrary> {
  const index = await loadIndex()
  const skins: SkinEntry[] = []
  for (const s of index.skins) {
    const png = await readFile(pngFile(s.id)).catch(() => null)
    if (!png) continue
    const alternate = (await readFile(alternateFile(s.id)).catch(() => null)) ?? png
    skins.push({ ...s, png: toDataUrl(png), alternate: toDataUrl(alternate) })
  }
  return { skins, equipped: index.equipped }
}

export async function saveSkin(input: SkinSaveInput): Promise<SkinEntry> {
  const png = decodeSkinPng(input.png)
  const alternate = decodeSkinPng(input.alternate)
  const index = await loadIndex()
  const now = Date.now()
  const existing = input.id ? index.skins.find((s) => s.id === input.id) : undefined
  const name = input.name.trim().slice(0, 48) || tr('skins.untitled')
  const stored: StoredSkin = existing
    ? { ...existing, name, model: input.model, favorite: input.favorite ?? existing.favorite, updatedAt: now }
    : { id: randomUUID(), name, model: input.model, source: input.source ?? 'created', favorite: input.favorite ?? false, createdAt: now, updatedAt: now }
  await mkdir(paths.skins(), { recursive: true })
  await writeFile(pngFile(stored.id), png)
  await writeFile(alternateFile(stored.id), alternate)
  index.skins = existing ? index.skins.map((s) => (s.id === stored.id ? stored : s)) : [stored, ...index.skins]
  await saveIndex(index)
  return { ...stored, png: toDataUrl(png), alternate: toDataUrl(alternate) }
}

export async function setFavorite(id: string, favorite: boolean): Promise<void> {
  const index = await loadIndex()
  index.skins = index.skins.map((s) => (s.id === id ? { ...s, favorite } : s))
  await saveIndex(index)
}

export async function deleteSkin(id: string): Promise<void> {
  const index = await loadIndex()
  // Only ids from the library name files, so nothing outside the skins folder can be removed.
  if (!index.skins.some((s) => s.id === id)) return
  index.skins = index.skins.filter((s) => s.id !== id)
  for (const [account, skin] of Object.entries(index.equipped)) if (skin === id) delete index.equipped[account]
  await saveIndex(index)
  await rm(pngFile(id), { force: true })
  await rm(alternateFile(id), { force: true })
}

/**
 * Wear a skin with an account (or take it off with null). Microsoft accounts upload it to Mojang, so it shows
 * everywhere; other accounts keep it here and get it in game through a resource pack (see applyOfflineSkin).
 */
export async function equipSkin(account: Account, skinId: string | null): Promise<void> {
  const index = await loadIndex()
  if (skinId) {
    const skin = index.skins.find((s) => s.id === skinId)
    if (!skin) throw new Error(tr('skins.error.notFound'))
    if (account.type === 'microsoft') await uploadToMojang(account, await readFile(pngFile(skinId)), skin.model)
    index.equipped[account.id] = skinId
  } else {
    if (account.type === 'microsoft') await resetMojangSkin(account)
    delete index.equipped[account.id]
  }
  await saveIndex(index)
}

const PROFILE_API = 'https://api.minecraftservices.com/minecraft/profile'

async function uploadToMojang(account: Account, png: Buffer, model: SkinModel): Promise<void> {
  const form = new FormData()
  form.set('variant', model)
  form.set('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'skin.png')
  const res = await fetch(`${PROFILE_API}/skins`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.accessToken}`, 'User-Agent': USER_AGENT },
    body: form
  })
  if (!res.ok) throw new Error(tr('skins.error.upload', { status: res.status }))
}

async function resetMojangSkin(account: Account): Promise<void> {
  const res = await fetch(`${PROFILE_API}/skins/active`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${account.accessToken}`, 'User-Agent': USER_AGENT }
  })
  if (!res.ok) throw new Error(tr('skins.error.upload', { status: res.status }))
}

/** Download the skin a Java Edition player wears, by username, through Mojang's public profile API. */
export async function skinFromUsername(username: string): Promise<RawSkin> {
  const name = username.trim()
  if (!/^\w{1,16}$/.test(name)) throw new Error(tr('skins.error.username'))
  const lookup = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`, {
    headers: { 'User-Agent': USER_AGENT }
  })
  if (lookup.status === 404 || lookup.status === 204) throw new Error(tr('skins.error.noPlayer', { name }))
  if (!lookup.ok) throw new Error(tr('error.httpFor', { status: lookup.status, url: 'api.mojang.com' }))
  const { id, name: exactName } = (await lookup.json()) as { id: string; name: string }
  const profile = await fetchJson<{ properties: { name: string; value: string }[] }>(
    `https://sessionserver.mojang.com/session/minecraft/profile/${id}`
  )
  const textures = profile.properties.find((p) => p.name === 'textures')
  const skin = textures
    ? (JSON.parse(Buffer.from(textures.value, 'base64').toString('utf8')) as {
        textures: { SKIN?: { url: string; metadata?: { model?: string } } }
      }).textures.SKIN
    : undefined
  if (!skin) throw new Error(tr('skins.error.defaultSkin', { name: exactName }))
  const res = await fetch(skin.url.replace(/^http:/, 'https:'), { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(tr('error.httpFor', { status: res.status, url: 'textures.minecraft.net' }))
  return { name: exactName, png: toDataUrl(Buffer.from(await res.arrayBuffer())), model: skin.metadata?.model === 'slim' ? 'slim' : 'classic' }
}

// ---------------------------------------------------------------------------------------------------------------------
// Offline accounts: a resource pack that replaces the default skins
// ---------------------------------------------------------------------------------------------------------------------

const PACK_FOLDER = 'PumaSkin'
/** The default skins an offline player can get (picked from their UUID), since 1.19.3. */
const DEFAULT_SKINS = ['steve', 'alex', 'ari', 'efe', 'kai', 'makena', 'noor', 'sunny', 'zuri']

/**
 * Minecraft can't load a custom skin for an offline account, so the launcher puts the equipped skin in a resource
 * pack that replaces the default skins and turns it on in options.txt; without an equipped skin the pack is removed.
 * The game picks the arm width from the player's UUID, so both widths of the skin are included.
 *
 * @param modernIds Minecraft 1.13+ names folder packs "file/<folder>" in options.txt; older versions use the folder.
 * @returns the name of the skin applied, if any
 */
export async function applyOfflineSkin(account: Account, gameDir: string, modernIds: boolean): Promise<string | null> {
  const index = await loadIndex()
  const skinId = account.type === 'offline' ? index.equipped[account.id] : undefined
  const skin = skinId ? index.skins.find((s) => s.id === skinId) : undefined
  const packDir = join(gameDir, 'resourcepacks', PACK_FOLDER)
  const packId = modernIds ? `file/${PACK_FOLDER}` : PACK_FOLDER

  if (!skin || !existsSync(pngFile(skin.id))) {
    if (existsSync(packDir)) {
      await rm(packDir, { recursive: true, force: true })
      await updateOptions(gameDir, packId, false)
    }
    return null
  }

  const png = await readFile(pngFile(skin.id))
  const alternate = (await readFile(alternateFile(skin.id)).catch(() => null)) ?? png
  const classic = skin.model === 'classic' ? png : alternate
  const slim = skin.model === 'slim' ? png : alternate
  await rm(packDir, { recursive: true, force: true })
  const textures = join(packDir, 'assets', 'minecraft', 'textures', 'entity')
  await mkdir(join(textures, 'player', 'wide'), { recursive: true })
  await mkdir(join(textures, 'player', 'slim'), { recursive: true })
  for (const name of DEFAULT_SKINS) {
    await writeFile(join(textures, 'player', 'wide', `${name}.png`), classic)
    await writeFile(join(textures, 'player', 'slim', `${name}.png`), slim)
  }
  // 1.8 – 1.19.2 have two default skins, in the entity folder.
  await writeFile(join(textures, 'steve.png'), classic)
  await writeFile(join(textures, 'alex.png'), slim)
  // Every format field any version reads, so no version flags the pack as made for another one.
  const pack = { pack: { pack_format: 1, supported_formats: [1, 9999], min_format: 1, max_format: 9999, description: `Puma Launcher: ${skin.name}` } }
  await writeFile(join(packDir, 'pack.mcmeta'), JSON.stringify(pack, null, 2))
  await updateOptions(gameDir, packId, true)
  return skin.name
}

/** Add the pack last in options.txt's resourcePacks (so it wins), or take it out. */
async function updateOptions(gameDir: string, packId: string, enabled: boolean): Promise<void> {
  const file = join(gameDir, 'options.txt')
  const text = await readFile(file, 'utf8').catch(() => null)
  if (text === null && !enabled) return
  const lines = text ? text.split(/\r?\n/) : []
  if (lines.at(-1) === '') lines.pop()
  const setList = (key: string, change: (list: string[]) => string[]) => {
    const i = lines.findIndex((l) => l.startsWith(`${key}:`))
    let list: string[] = []
    if (i >= 0) {
      try {
        list = JSON.parse(lines[i].slice(key.length + 1)) as string[]
      } catch {
        list = []
      }
    }
    const line = `${key}:${JSON.stringify(change(list.filter((p) => p !== packId)))}`
    if (i >= 0) lines[i] = line
    else lines.push(line)
  }
  setList('resourcePacks', (list) => (enabled ? [...(list.length || !packId.startsWith('file/') ? list : ['vanilla']), packId] : list))
  // Listing it here too keeps the game from asking whether to use a pack "made for another version".
  setList('incompatibleResourcePacks', (list) => (enabled ? [...list, packId] : list))
  await writeFile(file, `${lines.join('\n')}\n`)
}
