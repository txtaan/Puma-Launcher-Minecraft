import { existsSync } from 'node:fs'
import { mkdir, readdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { InstalledMod, Instance, LoaderType, ModSearchHit, RecommendedMod } from '@shared/types'
import { readZipEntry } from './archive'
import { readJson, writeJson } from './fsutil'
import { downloadAll, fetchJson } from './http'
import { gameDir } from './instances'
import { tr } from './i18n'

// Mod management in the spirit of Prism's and HMCL's mod pages, using Modrinth's public API.

const MODRINTH = 'https://api.modrinth.com/v2'

const modsDir = (instanceId: string) => join(gameDir(instanceId), 'mods')
/** Remembers which Modrinth project each downloaded file came from (filename -> project id). */
const indexFile = (instanceId: string) => join(modsDir(instanceId), '.puma-index.json')
/** Index written before the rename to Puma Launcher. */
const legacyIndexFile = (instanceId: string) => join(modsDir(instanceId), '.txtaan-index.json')

async function readIndex(instanceId: string): Promise<Record<string, string>> {
  return (
    (await readJson<Record<string, string> | null>(indexFile(instanceId), null)) ??
    readJson<Record<string, string>>(legacyIndexFile(instanceId), {})
  )
}

/** Modrinth loader names a given instance can use. Quilt runs Fabric mods too. */
function modLoaders(instance: Instance): string[] {
  switch (instance.loader?.type) {
    case 'fabric':
      return ['fabric']
    case 'quilt':
      return ['quilt', 'fabric']
    case 'forge':
      return ['forge']
    case 'neoforge':
      return ['neoforge']
    default:
      return []
  }
}

function requireLoader(instance: Instance): string[] {
  const loaders = modLoaders(instance)
  if (!loaders.length) throw new Error(tr('error.needLoader'))
  return loaders
}

/** Read name/version from fabric.mod.json, quilt.mod.json or (neo)forge mods.toml. */
async function readModMeta(file: string): Promise<{ name?: string; version?: string }> {
  const fabric = await readZipEntry(file, 'fabric.mod.json')
  if (fabric) {
    try {
      const j = JSON.parse(fabric.toString('utf8').replace(/^﻿/, '')) as { name?: string; id?: string; version?: string }
      return { name: j.name ?? j.id, version: j.version }
    } catch {
      /* malformed metadata: fall through */
    }
  }
  const quilt = await readZipEntry(file, 'quilt.mod.json')
  if (quilt) {
    try {
      const j = JSON.parse(quilt.toString('utf8')) as { quilt_loader?: { id?: string; version?: string; metadata?: { name?: string } } }
      return { name: j.quilt_loader?.metadata?.name ?? j.quilt_loader?.id, version: j.quilt_loader?.version }
    } catch {
      /* fall through */
    }
  }
  const toml = (await readZipEntry(file, 'META-INF/neoforge.mods.toml')) ?? (await readZipEntry(file, 'META-INF/mods.toml'))
  if (toml) {
    const text = toml.toString('utf8')
    const name = /displayName\s*=\s*"([^"]+)"/.exec(text)?.[1]
    const version = /^\s*version\s*=\s*"([^"]+)"/m.exec(text)?.[1]
    return { name, version: version?.includes('${') ? undefined : version }
  }
  return {}
}

export async function listMods(instanceId: string): Promise<InstalledMod[]> {
  const dir = modsDir(instanceId)
  if (!existsSync(dir)) return []
  const index = await readIndex(instanceId)
  const files = (await readdir(dir)).filter((f) => /\.jar(\.disabled)?$/i.test(f))
  const mods = await Promise.all(
    files.map(async (fileName) => {
      const meta = await readModMeta(join(dir, fileName))
      const base = fileName.replace(/\.disabled$/i, '')
      return {
        fileName,
        enabled: !fileName.endsWith('.disabled'),
        name: meta.name ?? base.replace(/\.jar$/i, ''),
        version: meta.version,
        projectId: index[base]
      }
    })
  )
  return mods.sort((a, b) => a.name.localeCompare(b.name))
}

export async function setModEnabled(instanceId: string, fileName: string, enabled: boolean): Promise<void> {
  const dir = modsDir(instanceId)
  const base = fileName.replace(/\.disabled$/i, '')
  await rename(join(dir, fileName), join(dir, enabled ? base : `${base}.disabled`))
}

export async function deleteMod(instanceId: string, fileName: string): Promise<void> {
  if (fileName.includes('/') || fileName.includes('\\')) throw new Error(tr('error.invalidFileName'))
  await rm(join(modsDir(instanceId), fileName), { force: true })
  const index = await readIndex(instanceId)
  delete index[fileName.replace(/\.disabled$/i, '')]
  await writeJson(indexFile(instanceId), index)
}

interface SearchResponse {
  hits: {
    project_id: string
    slug: string
    title: string
    description: string
    author: string
    downloads: number
    icon_url?: string
  }[]
  total_hits: number
}

export async function searchMods(
  instance: Instance,
  query: string,
  offset = 0
): Promise<{ hits: ModSearchHit[]; total: number }> {
  const loaders = requireLoader(instance)
  const facets = [['project_type:mod'], loaders.map((l) => `categories:${l}`), [`versions:${instance.versionId}`]]
  const params = new URLSearchParams({
    query,
    facets: JSON.stringify(facets),
    index: query ? 'relevance' : 'downloads',
    limit: '20',
    offset: String(offset)
  })
  const res = await fetchJson<SearchResponse>(`${MODRINTH}/search?${params}`)
  const installed = new Set(Object.values(await readIndex(instance.id)))
  return {
    total: res.total_hits,
    hits: res.hits.map((h) => ({
      projectId: h.project_id,
      slug: h.slug,
      title: h.title,
      description: h.description,
      author: h.author,
      downloads: h.downloads,
      iconUrl: h.icon_url,
      installed: installed.has(h.project_id)
    }))
  }
}

interface ModrinthVersion {
  id: string
  project_id: string
  version_number: string
  files: { url: string; filename: string; primary: boolean; size: number; hashes: { sha1: string } }[]
  dependencies: { project_id?: string; version_id?: string; dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded' }[]
}

async function compatibleVersion(instance: Instance, projectId: string): Promise<ModrinthVersion | undefined> {
  const params = new URLSearchParams({
    loaders: JSON.stringify(modLoaders(instance)),
    game_versions: JSON.stringify([instance.versionId])
  })
  const versions = await fetchJson<ModrinthVersion[]>(`${MODRINTH}/project/${projectId}/version?${params}`)
  return versions[0]
}

// Popular, well-maintained mods suggested when creating an instance. Ticked ones are the essentials
// (the loader's API) and performance mods that are safe in almost any setup.
const RECOMMENDED: Record<Exclude<LoaderType, 'vanilla'>, { slug: string; preselected: boolean }[]> = {
  fabric: [
    { slug: 'fabric-api', preselected: true },
    { slug: 'sodium', preselected: true },
    { slug: 'lithium', preselected: true },
    { slug: 'ferrite-core', preselected: true },
    { slug: 'entityculling', preselected: false },
    { slug: 'iris', preselected: false },
    { slug: 'modmenu', preselected: false },
    { slug: 'appleskin', preselected: false },
    { slug: 'xaeros-minimap', preselected: false },
    { slug: 'jei', preselected: false }
  ],
  // Quilt runs Fabric mods; Fabric API is the maintained API for both.
  quilt: [
    { slug: 'fabric-api', preselected: true },
    { slug: 'sodium', preselected: true },
    { slug: 'lithium', preselected: true },
    { slug: 'ferrite-core', preselected: true },
    { slug: 'entityculling', preselected: false },
    { slug: 'iris', preselected: false },
    { slug: 'modmenu', preselected: false },
    { slug: 'appleskin', preselected: false },
    { slug: 'xaeros-minimap', preselected: false }
  ],
  forge: [
    { slug: 'embeddium', preselected: true },
    { slug: 'ferrite-core', preselected: true },
    { slug: 'modernfix', preselected: true },
    { slug: 'entityculling', preselected: true },
    { slug: 'jei', preselected: false },
    { slug: 'appleskin', preselected: false },
    { slug: 'xaeros-minimap', preselected: false },
    { slug: 'journeymap', preselected: false }
  ],
  neoforge: [
    { slug: 'sodium', preselected: true },
    { slug: 'ferrite-core', preselected: true },
    { slug: 'modernfix', preselected: true },
    { slug: 'entityculling', preselected: true },
    { slug: 'iris', preselected: false },
    { slug: 'jei', preselected: false },
    { slug: 'appleskin', preselected: false },
    { slug: 'xaeros-minimap', preselected: false }
  ]
}

/** Recommended mods that actually have a build for this loader + Minecraft version. */
export async function recommendedMods(type: Exclude<LoaderType, 'vanilla'>, mcVersion: string): Promise<RecommendedMod[]> {
  const list = RECOMMENDED[type]
  const ids = encodeURIComponent(JSON.stringify(list.map((r) => r.slug)))
  const projects = await fetchJson<{ id: string; slug: string; title: string; description: string; icon_url?: string }[]>(
    `${MODRINTH}/projects?ids=${ids}`
  )
  const probe = { id: '', name: '', createdAt: 0, versionId: mcVersion, loader: { type, version: '' } } satisfies Instance
  const checked = await Promise.all(
    list.map(async (r): Promise<RecommendedMod | null> => {
      const p = projects.find((x) => x.slug === r.slug)
      if (!p || !(await compatibleVersion(probe, p.id).catch(() => undefined))) return null
      return { projectId: p.id, slug: p.slug, title: p.title, description: p.description, iconUrl: p.icon_url, preselected: r.preselected }
    })
  )
  return checked.filter((m): m is RecommendedMod => m !== null)
}

/** Install the newest compatible version of a Modrinth project plus its required dependencies. */
export async function installMod(instance: Instance, projectId: string): Promise<string[]> {
  requireLoader(instance)
  const dir = modsDir(instance.id)
  await mkdir(dir, { recursive: true })
  const index = await readIndex(instance.id)
  const installedProjects = new Set(Object.values(index))
  const installedNames: string[] = []

  const queue: { projectId?: string; versionId?: string }[] = [{ projectId }]
  const seen = new Set<string>()
  while (queue.length) {
    const next = queue.shift()!
    const version = next.versionId
      ? await fetchJson<ModrinthVersion>(`${MODRINTH}/version/${next.versionId}`)
      : await compatibleVersion(instance, next.projectId!)
    if (!version) {
      if (next.projectId === projectId) throw new Error(tr('error.noModVersion', { version: instance.versionId, loader: instance.loader?.type ?? '' }))
      continue
    }
    if (seen.has(version.project_id)) continue
    seen.add(version.project_id)
    if (version.project_id !== projectId && installedProjects.has(version.project_id)) continue

    // Replace an older file of the same project, if any.
    for (const [file, pid] of Object.entries(index)) {
      if (pid === version.project_id) {
        await rm(join(dir, file), { force: true })
        await rm(join(dir, `${file}.disabled`), { force: true })
        delete index[file]
      }
    }
    const file = version.files.find((f) => f.primary) ?? version.files[0]
    await downloadAll([{ url: file.url, dest: join(dir, file.filename), sha1: file.hashes.sha1, size: file.size }], 1, () => undefined)
    index[file.filename] = version.project_id
    installedNames.push(file.filename)

    for (const dep of version.dependencies) {
      if (dep.dependency_type === 'required') queue.push({ projectId: dep.project_id, versionId: dep.version_id })
    }
  }
  await writeJson(indexFile(instance.id), index)
  return installedNames
}
