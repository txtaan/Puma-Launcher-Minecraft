import { app, shell } from 'electron'
import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { autoUpdater } from 'electron-updater'
import type { UpdateInfo, UpdateStatus } from '@shared/types'
import { download, isValid, USER_AGENT, type DownloadItem } from './http'
import { tr } from './i18n'
import { anyRunning } from './launch'
import { paths } from './paths'
import { emit } from './progress'

/**
 * Keeps the launcher itself up to date from the GitHub Releases that CI publishes.
 * - Windows and the Linux AppImage use electron-updater: a new version downloads in the background and is installed
 *   when the user clicks Update (or on the next quit).
 * - macOS and the Linux .deb get the new installer downloaded instead, and Update opens it. macOS only lets an app
 *   replace itself when it's signed with an Apple Developer ID, which this one isn't.
 */
const REPO = 'txtaan/Puma-Launcher-Minecraft'
const FIRST_CHECK_MS = 10_000
const CHECK_EVERY_MS = 6 * 60 * 60_000

const method: UpdateInfo['method'] = process.platform === 'win32' || process.env.APPIMAGE ? 'restart' : 'installer'
let state: UpdateStatus = { status: 'idle' }
let installerPath: string | undefined

export function updateInfo(): UpdateInfo {
  return { current: app.getVersion(), supported: app.isPackaged, method, state }
}

function setState(next: UpdateStatus): void {
  state = next
  emit('update:state', updateInfo())
}

/** Check now and then every few hours. Development builds can't update themselves, so they never check. */
export function startUpdater(): void {
  if (!app.isPackaged) return
  if (method === 'restart') {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('checking-for-update', () => setState({ status: 'checking' }))
    autoUpdater.on('update-not-available', () => setState({ status: 'latest' }))
    autoUpdater.on('update-available', (info) => setState({ status: 'downloading', version: info.version, percent: 0 }))
    autoUpdater.on('download-progress', (p) => {
      if (state.status === 'downloading') setState({ ...state, percent: Math.floor(p.percent) })
    })
    autoUpdater.on('update-downloaded', (info) => setState({ status: 'ready', version: info.version }))
    autoUpdater.on('error', (err) => setState({ status: 'error', message: err.message }))
  }
  setTimeout(() => void checkForUpdates(), FIRST_CHECK_MS)
  setInterval(() => void checkForUpdates(), CHECK_EVERY_MS)
}

export async function checkForUpdates(): Promise<UpdateInfo> {
  const busy = state.status === 'checking' || state.status === 'downloading' || state.status === 'ready'
  if (!app.isPackaged || busy) return updateInfo()
  try {
    if (method === 'restart') await autoUpdater.checkForUpdates()
    else await downloadInstaller()
  } catch (err) {
    setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
  }
  return updateInfo()
}

/** Restart into the downloaded version, or open the downloaded installer. */
export async function installUpdate(): Promise<void> {
  if (state.status !== 'ready') return
  if (anyRunning()) throw new Error(tr('update.closeGame'))
  if (method === 'restart') {
    // Install silently, then start the new version.
    autoUpdater.quitAndInstall(true, true)
    return
  }
  const error = await shell.openPath(installerPath!)
  if (error) throw new Error(error)
}

/**
 * The latest release's version, read from where github.com/<repo>/releases/latest redirects to. Unlike GitHub's API,
 * this isn't limited to 60 requests an hour per address, which shared networks (schools, mobile carriers) run into.
 */
async function latestVersion(): Promise<string> {
  const url = `https://github.com/${REPO}/releases/latest`
  const res = await fetch(url, { method: 'HEAD', redirect: 'manual', headers: { 'User-Agent': USER_AGENT } })
  const tag = /\/releases\/tag\/([^/?#]+)/.exec(res.headers.get('location') ?? '')?.[1]
  if (!tag) throw new Error(tr('error.httpFor', { status: res.status, url }))
  return decodeURIComponent(tag).replace(/^v/, '')
}

/** macOS and .deb: find the latest version and download its installer for this computer. */
async function downloadInstaller(): Promise<void> {
  setState({ status: 'checking' })
  const version = await latestVersion()
  if (!isNewer(version, app.getVersion())) return setState({ status: 'latest' })

  // Same names as electron-builder's artifactName settings in package.json.
  const platform = process.platform === 'darwin' ? `macos-${process.arch === 'arm64' ? 'arm64' : 'x64'}.dmg` : 'linux-amd64.deb'
  const name = `PumaLauncher-${version}-${platform}`
  const url = `https://github.com/${REPO}/releases/download/v${version}/${name}`
  const head = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': USER_AGENT } })
  if (!head.ok) throw new Error(tr('update.noInstaller', { version }))
  const size = Number(head.headers.get('content-length')) || undefined

  const dir = join(paths.cache(), 'updates')
  const item: DownloadItem = { url, dest: join(dir, name), size }
  // Older installers are of no use once a newer one is out.
  for (const file of await readdir(dir).catch(() => [] as string[])) {
    if (file !== name) await rm(join(dir, file), { recursive: true, force: true })
  }
  if (!(await isValid(item))) {
    setState({ status: 'downloading', version, percent: 0 })
    await download(item, 3, (received, total) => {
      const percent = total ? Math.floor((received / total) * 100) : 0
      if (state.status === 'downloading' && percent !== state.percent) setState({ status: 'downloading', version, percent })
    })
  }
  installerPath = item.dest
  setState({ status: 'ready', version })
}

/** True when version `a` is newer than `b`, comparing major.minor.patch ("0.3.10" is newer than "0.3.9"). */
export function isNewer(a: string, b: string): boolean {
  const parts = (v: string) => v.split('.').slice(0, 3).map((p) => parseInt(p, 10) || 0)
  const [pa, pb] = [parts(a), parts(b)]
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0)
  return false
}
