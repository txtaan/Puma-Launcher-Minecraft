import { app, BrowserWindow, clipboard, ipcMain, shell } from 'electron'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Instance, LoaderType, Settings } from '@shared/types'
import * as auth from './core/auth'
import * as instances from './core/instances'
import { resolveVersion } from './core/install'
import { availableRuntimes, detectJava, installRuntime, resolveJava } from './core/java'
import { isRunning, killInstance, launchInstance } from './core/launch'
import { loaderVersions } from './core/meta'
import * as mods from './core/mods'
import { paths } from './core/paths'
import { emit, setProgressTarget, task } from './core/progress'
import { getSettings, updateSettings } from './core/settings'
import { getVersions, refreshVersions, startVersionWatcher } from './core/versions'

let win: BrowserWindow | undefined

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
    backgroundColor: '#0b0b14',
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
        t ??= task(`java-prepare:${inst.id}`, `Java for ${inst.name}`)
        t.update(stage, done, total)
      }
    })
    t?.finish()
  } catch (err) {
    t?.fail(err)
  }
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
    const t = task(`java:${component}`, `Installing ${component}`)
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
    (await instances.listInstances()).map((i) => ({ ...i, running: isRunning(i.id) }))
  )
  handle('instances:create', async (name: string, versionId: string, loader?: Instance['loader']) => {
    const inst = await instances.createInstance(name, versionId, loader)
    void prepareJava(inst)
    return inst
  })
  handle('instances:update', async (id: string, patch: Partial<Instance>) => {
    const before = await instances.getInstance(id)
    const inst = await instances.updateInstance(id, patch)
    if (inst.versionId !== before.versionId || inst.javaPath !== before.javaPath) void prepareJava(inst)
    return inst
  })
  handle('instances:delete', (id: string) => {
    if (isRunning(id)) throw new Error('Stop the game before deleting this instance.')
    return instances.deleteInstance(id)
  })
  handle('instances:openFolder', (id: string) => shell.openPath(instances.gameDir(id)))
  handle('instances:kill', (id: string) => killInstance(id))
  handle('instances:launch', async (id: string, accountId: string) => {
    const settings = await getSettings()
    const instance = await instances.getInstance(id)
    const account = await auth.getLaunchAccount(accountId, settings.msClientId)
    const t = task(`launch:${id}`, `Launching ${instance.name}`)
    const log = (line: string, stream: 'stdout' | 'stderr' | 'launcher') =>
      emit('game:log', { instanceId: id, line, stream })
    try {
      await launchInstance(instance, account, settings, {
        onProgress: t.update,
        onLog: log,
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
      log(`Launch failed: ${err instanceof Error ? err.message : String(err)}`, 'launcher')
      throw err
    }
  })
  handle('paths:openRoot', () => shell.openPath(paths.root()))
}

app.whenReady().then(async () => {
  registerIpc()
  createWindow()
  const settings = await getSettings()
  void refreshVersions()
    .catch(() => undefined)
    .then(async () => {
      // Re-download Java for existing instances if it is missing (e.g. after a fresh install or cleanup).
      for (const inst of await instances.listInstances()) await prepareJava(inst)
    })
  startVersionWatcher(settings.versionRefreshMinutes)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
