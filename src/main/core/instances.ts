import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { Instance } from '@shared/types'
import { readJson, writeJson } from './fsutil'
import { paths } from './paths'
import { tr } from './i18n'

// Prism-style instances: every instance is an isolated game directory
// (saves, mods, resource packs, options) with its own Java/memory settings.

const metaFile = (id: string) => join(paths.instanceDir(id), 'instance.json')
export const gameDir = (id: string) => join(paths.instanceDir(id), '.minecraft')

export async function listInstances(): Promise<Instance[]> {
  let dirs: string[] = []
  try {
    dirs = await readdir(paths.instances())
  } catch {
    return []
  }
  const all = await Promise.all(dirs.map((d) => readJson<Instance | null>(metaFile(d), null)))
  return all
    .filter((i): i is Instance => !!i)
    .sort((a, b) => (b.lastPlayed ?? b.createdAt) - (a.lastPlayed ?? a.createdAt))
}

export async function getInstance(id: string): Promise<Instance> {
  const inst = await readJson<Instance | null>(metaFile(id), null)
  if (!inst) throw new Error(tr('error.instanceNotFound', { id }))
  return inst
}

export async function createInstance(name: string, versionId: string, loader?: Instance['loader']): Promise<Instance> {
  const inst: Instance = { id: randomUUID(), name: name.trim() || versionId, versionId, loader, createdAt: Date.now() }
  await mkdir(gameDir(inst.id), { recursive: true })
  await writeJson(metaFile(inst.id), inst)
  return inst
}

export async function updateInstance(id: string, patch: Partial<Instance>): Promise<Instance> {
  const inst = { ...(await getInstance(id)), ...patch, id }
  await writeJson(metaFile(id), inst)
  return inst
}

export async function deleteInstance(id: string): Promise<void> {
  const dir = paths.instanceDir(id)
  if (existsSync(metaFile(id))) await rm(dir, { recursive: true, force: true })
}
