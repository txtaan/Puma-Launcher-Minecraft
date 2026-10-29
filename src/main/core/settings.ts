import type { Settings } from '@shared/types'
import { readJson, writeJson } from './fsutil'
import { paths } from './paths'

export const DEFAULT_SETTINGS: Settings = {
  msClientId: process.env.PUMA_MS_CLIENT_ID ?? process.env.TXTAAN_MS_CLIENT_ID ?? '',
  defaultMaxMemoryMb: 4096,
  defaultMinMemoryMb: 512,
  autoDownloadJava: true,
  versionRefreshMinutes: 10,
  concurrentDownloads: 16,
  closeOnLaunch: false
}

let cached: Settings | undefined

export async function getSettings(): Promise<Settings> {
  if (!cached) cached = { ...DEFAULT_SETTINGS, ...(await readJson<Partial<Settings>>(paths.settings(), {})) }
  return cached
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  cached = { ...(await getSettings()), ...patch }
  await writeJson(paths.settings(), cached)
  return cached
}
