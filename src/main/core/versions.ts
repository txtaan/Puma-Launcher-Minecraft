import { existsSync } from 'node:fs'
import type { VersionList, VersionSummary, VersionType } from '@shared/types'
import { fetchJson } from './http'
import { readJson, writeJson } from './fsutil'
import { paths } from './paths'
import { join } from 'node:path'
import { emit } from './progress'

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'

interface RawManifest {
  latest: { release: string; snapshot: string }
  versions: { id: string; type: VersionType; url: string; sha1: string; releaseTime: string }[]
}

let current: VersionList | undefined
let timer: NodeJS.Timeout | undefined

const cacheFile = () => join(paths.cache(), 'version_manifest_v2.json')

function withInstalled(raw: RawManifest, fetchedAt: number): VersionList {
  return {
    latest: raw.latest,
    fetchedAt,
    versions: raw.versions.map<VersionSummary>((v) => ({
      id: v.id,
      type: v.type,
      url: v.url,
      sha1: v.sha1,
      releaseTime: v.releaseTime,
      installed: existsSync(paths.versionJar(v.id)) && existsSync(paths.versionJson(v.id))
    }))
  }
}

/**
 * Fetch Mojang's version manifest. Falls back to the on-disk cache when offline,
 * so already-installed versions remain launchable without a connection.
 */
export async function refreshVersions(): Promise<VersionList> {
  const previous = current
  try {
    const raw = await fetchJson<RawManifest>(MANIFEST_URL, { cache: 'no-store' })
    await writeJson(cacheFile(), raw)
    current = withInstalled(raw, Date.now())
  } catch (err) {
    const cachedRaw = await readJson<RawManifest | null>(cacheFile(), null)
    if (!cachedRaw) throw err
    current = withInstalled(cachedRaw, 0)
  }
  if (
    previous &&
    (previous.latest.release !== current.latest.release || previous.latest.snapshot !== current.latest.snapshot)
  ) {
    emit('versions:new', current.latest)
  }
  return current
}

export async function getVersions(force = false): Promise<VersionList> {
  if (!current || force) return refreshVersions()
  return withInstalledFromCurrent()
}

function withInstalledFromCurrent(): VersionList {
  const list = current!
  for (const v of list.versions) {
    v.installed = existsSync(paths.versionJar(v.id)) && existsSync(paths.versionJson(v.id))
  }
  return list
}

export async function findVersion(id: string): Promise<VersionSummary | undefined> {
  return (await getVersions()).versions.find((v) => v.id === id)
}

/** Poll Mojang so new releases and snapshots show up without restarting the launcher. */
export function startVersionWatcher(minutes: number): void {
  if (timer) clearInterval(timer)
  timer = setInterval(() => void refreshVersions().catch(() => undefined), Math.max(1, minutes) * 60_000)
}
