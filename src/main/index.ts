import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, shell } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { Instance, LoaderType, RawSkin, Settings, SkinSaveInput, ThemePreference } from '@shared/types'
import * as auth from './core/auth'
import * as instances from './core/instances'
import { resolveVersion } from './core/install'
import { availableRuntimes, detectJava, installRuntime, resolveJava } from './core/java'
import { isRunning, isWindowOpen, killInstance, launchInstance } from './core/launch'
import { loaderVersions } from './core/meta'
import * as mods from './core/mods'
import { paths } from './core/paths'
import { seconds, setLanguage, tr } from './core/i18n'
import { emit, setProgressTarget, task } from './core/progress'
import { getSettings, updateSettings } from './core/settings'
import * as skins from './core/skins'
import { checkForUpdates, installUpdate, startUpdater, updateInfo } from './core/updater'
import { getVersions, refreshVersions, startVersionWatcher } from './core/versions'

let win: BrowserWindow | undefined

/** Matches --bg in theme.css, so the window doesn't flash the wrong colour while loading or resizing. */
const windowBackground = () => (nativeTheme.shouldUseDarkColors ? '#0b0b14' : '#e7e7e7')

/** Native parts (macOS window buttons, form controls, prefers-color-scheme) follow the launcher's theme. */
function applyTheme(theme: ThemePreference): void {
  nativeTheme.themeSource = theme
  win?.setBackgroundColor(windowBackground())
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1180,
    height: 740,
    minWidth: 940,
    minHeight: 600,
    // macOS keeps its native traffic-light buttons over our custom title bar; elsewhere we draw our own.
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 13 } }
      : { frame: false }),
    backgroundColor: windowBackground(),
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })
  setProgressTarget(win.webContents)
  win.once('ready-to-show', () => win?.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

/** Register an IPC handler; errors are re-thrown with a clean message for the renderer. */
function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => Promise<R> | R): void {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return await fn(...(args as A))
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  })
}

/**
 * Download the Java an instance needs in the background, so it is ready before the user presses Play.
 * Shows up in the download dock only when something actually has to be downloaded.
 */
async function prepareJava(inst: Instance): Promise<void> {
  const settings = await getSettings()
  if (inst.javaPath || !settings.autoDownloadJava) return
  let t: ReturnType<typeof task> | undefined
  try {
    const version = await resolveVersion(inst.versionId)
    await resolveJava({
      component: version.javaVersion?.component,
      majorVersion: version.javaVersion?.majorVersion ?? 8,
      autoDownload: true,
      concurrency: settings.concurrentDownloads,
      onProgress: (stage, done, total) => {
        t ??= task(`java-prepare:${inst.id}`, tr('task.javaFor', { name: inst.name }))
        t.update(stage, done, total)
      }
    })
    t?.finish()
  } catch (err) {
    t?.fail(err)
  }
}

/** Install the mods picked in the "new instance" dialog, shown as one task in the download dock. */
async function installModsInBackground(inst: Instance, projectIds: string[]): Promise<void> {
  const t = task(`mods:${inst.id}`, tr('task.modsFor', { name: inst.name }))
  const failed: string[] = []
  for (const [i, id] of projectIds.entries()) {
    t.update(tr('stage.installingMods'), i, projectIds.length)
    await mods.installMod(inst, id).catch(() => failed.push(id))
  }
  if (failed.length) t.fail(new Error(tr('error.modsFailed', { failed: failed.length, total: projectIds.length })))
  else t.finish()
}

function registerIpc(): void {
  // Window controls (frameless window)
  ipcMain.on('window:minimize', () => win?.minimize())
  ipcMain.on('window:maximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()))
  ipcMain.on('window:close', () => win?.close())

  handle('shell:openExternal', (url: string) => {
    if (/^https?:\/\//.test(url)) return shell.openExternal(url)
  })
  handle('clipboard:write', (text: string) => clipboard.writeText(text))

  handle('versions:list', (force?: boolean) => getVersions(force))

  handle('settings:get', () => getSettings())
  handle('settings:update', async (patch: Partial<Settings>) => {
    const s = await updateSettings(patch)
    if (patch.versionRefreshMinutes) startVersionWatcher(s.versionRefreshMinutes)
    if (patch.theme) applyTheme(s.theme)
    if (patch.language) setLanguage(s.language)
    return s
  })

  handle('accounts:list', () => auth.listAccounts())
  handle('accounts:addOffline', (name: string) => auth.addOfflineAccount(name))
  handle('accounts:remove', (id: string) => auth.removeAccount(id))
  handle('accounts:loginMicrosoft', async () => {
    const { msClientId } = await getSettings()
    return auth.loginMicrosoft(msClientId, (prompt) => emit('auth:deviceCode', prompt))
  })
  handle('accounts:cancelLogin', () => auth.cancelLogin())
  handle('accounts:addAuthlib', (server: string, username: string, password: string) =>
    auth.addAuthlibAccount(server, username, password)
  )
  handle('accounts:authPresets', () => auth.AUTH_SERVER_PRESETS)

  handle('loaders:versions', (type: Exclude<LoaderType, 'vanilla'>, mcVersion: string) => loaderVersions(type, mcVersion))

  handle('mods:list', (id: string) => mods.listMods(id))
  handle('mods:recommended', (type: Exclude<LoaderType, 'vanilla'>, mcVersion: string) => mods.recommendedMods(type, mcVersion))
  handle('mods:setEnabled', (id: string, file: string, enabled: boolean) => mods.setModEnabled(id, file, enabled))
  handle('mods:delete', (id: string, file: string) => mods.deleteMod(id, file))
  handle('mods:search', async (id: string, query: string, offset?: number) =>
    mods.searchMods(await instances.getInstance(id), query, offset)
  )
  handle('mods:install', async (id: string, projectId: string) =>
    mods.installMod(await instances.getInstance(id), projectId)
  )
  handle('mods:openFolder', async (id: string) => {
    const dir = join(instances.gameDir(id), 'mods')
    await mkdir(dir, { recursive: true })
    return shell.openPath(dir)
  })

  handle('java:detect', () => detectJava())
  handle('java:runtimes', () => availableRuntimes())
  handle('java:install', async (component: string) => {
    const { concurrentDownloads } = await getSettings()
    const t = task(`java:${component}`, tr('task.installing', { name: component }))
    try {
      const exe = await installRuntime(component, concurrentDownloads, t.update)
      t.finish()
      return exe
    } catch (err) {
      t.fail(err)
      throw err
    }
  })

  handle('instances:list', async () =>
    (await instances.listInstances()).map((i) => ({ ...i, running: isRunning(i.id), windowOpen: isWindowOpen(i.id) }))
  )
  handle('instances:create', async (name: string, versionId: string, loader?: Instance['loader'], modIds: string[] = []) => {
    const inst = await instances.createInstance(name, versionId, loader)
    void prepareJava(inst)
    if (modIds.length) void installModsInBackground(inst, modIds)
    return inst
  })
  handle('instances:update', async (id: string, patch: Partial<Instance>) => {
    const before = await instances.getInstance(id)
    const inst = await instances.updateInstance(id, patch)
    if (inst.versionId !== before.versionId || inst.javaPath !== before.javaPath) void prepareJava(inst)
    return inst
  })
  handle('instances:delete', (id: string) => {
    if (isRunning(id)) throw new Error(tr('error.stopBeforeDelete'))
    return instances.deleteInstance(id)
  })
  handle('instances:openFolder', (id: string) => shell.openPath(instances.gameDir(id)))
  handle('instances:kill', (id: string) => killInstance(id))
  handle('instances:launch', async (id: string, accountId: string) => {
    const settings = await getSettings()
    const instance = await instances.getInstance(id)
    const signInStartedAt = performance.now()
    const account = await auth.getLaunchAccount(accountId, settings.msClientId)
    const signInMs = performance.now() - signInStartedAt
    const t = task(`launch:${id}`, tr('task.launching', { name: instance.name }))
    const log = (line: string, stream: 'stdout' | 'stderr' | 'launcher') =>
      emit('game:log', { instanceId: id, line, stream })
    // Only worth a line when the account had to be renewed online (Microsoft about once a day).
    if (signInMs >= 100) log(tr('log.signedIn', { seconds: seconds(signInMs) }), 'launcher')
    try {
      await launchInstance(instance, account, settings, {
        onProgress: t.update,
        onLog: log,
        onWindowOpen: () => emit('game:windowOpen', { instanceId: id }),
        onExit: (code) => {
          emit('game:exit', { instanceId: id, code })
          if (settings.closeOnLaunch) win?.show()
        }
      })
      t.finish()
      await instances.updateInstance(id, { lastPlayed: Date.now() })
      emit('game:started', { instanceId: id })
      if (settings.closeOnLaunch) win?.hide()
    } catch (err) {
      t.fail(err)
      log(tr('log.launchFailed', { error: err instanceof Error ? err.message : String(err) }), 'launcher')
      throw err
    }
  })
  handle('paths:openRoot', () => shell.openPath(paths.root()))

  // Skins
  handle('skins:list', () => skins.listSkins())
  handle('skins:save', (input: SkinSaveInput) => skins.saveSkin(input))
  handle('skins:favorite', (id: string, favorite: boolean) => skins.setFavorite(id, favorite))
  handle('skins:delete', (id: string) => skins.deleteSkin(id))
  handle('skins:equip', async (accountId: string, skinId: string | null) => {
    const settings = await getSettings()
    await skins.equipSkin(await auth.getLaunchAccount(accountId, settings.msClientId), skinId)
    return skins.listSkins()
  })
  handle('skins:fromUsername', (username: string) => skins.skinFromUsername(username))
  handle('skins:openFiles', async (): Promise<RawSkin[]> => {
    const pick = await dialog.showOpenDialog(win!, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: tr('skins.fileFilter'), extensions: ['png'] }]
    })
    const files: RawSkin[] = []
    for (const path of pick.filePaths) {
      const png = await readFile(path)
      if (png.length <= 256 * 1024) files.push({ name: basename(path, extname(path)), png: `data:image/png;base64,${png.toString('base64')}` })
    }
    return files
  })
  handle('skins:export', async (name: string, png: string) => {
    const pick = await dialog.showSaveDialog(win!, {
      defaultPath: `${name.replace(/[\\/:*?"<>|]/g, '_') || 'skin'}.png`,
      filters: [{ name: tr('skins.fileFilter'), extensions: ['png'] }]
    })
    if (pick.canceled || !pick.filePath) return null
    await writeFile(pick.filePath, Buffer.from(png.replace(/^data:image\/png;base64,/, ''), 'base64'))
    return pick.filePath
  })

  // The launcher's own updates
  handle('updates:get', async () => updateInfo())
  handle('updates:check', () => checkForUpdates())
  handle('updates:install', () => installUpdate())
}

app.whenReady().then(async () => {
  registerIpc()
  const settings = await getSettings()
  applyTheme(settings.theme)
  setLanguage(settings.language)
  nativeTheme.on('updated', () => win?.setBackgroundColor(windowBackground()))
  createWindow()
  void refreshVersions()
    .catch(() => undefined)
    .then(async () => {
      // Re-download Java for existing instances if it is missing (e.g. after a fresh install or cleanup).
      for (const inst of await instances.listInstances()) await prepareJava(inst)
    })
  startVersionWatcher(settings.versionRefreshMinutes)
  startUpdater()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
