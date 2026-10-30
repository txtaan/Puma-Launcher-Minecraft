import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  DeviceCodePrompt,
  GameExitEvent,
  GameLogEvent,
  InstalledMod,
  Instance,
  JavaInstall,
  LoaderType,
  LoaderVersion,
  ModSearchHit,
  JavaRuntimeOption,
  ProgressEvent,
  PublicAccount,
  RawSkin,
  Settings,
  SkinEntry,
  SkinLibrary,
  SkinSaveInput,
  UpdateInfo,
  VersionList
} from '@shared/types'

const invoke = <T>(channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args) as Promise<T>

function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

export type InstanceWithState = Instance & {
  /** The game is running (from the moment Java starts). */
  running: boolean
  /** The game's window is open; while `running` without it, the game is still opening. */
  windowOpen: boolean
}

const api = {
  platform: process.platform,
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close')
  },
  openExternal: (url: string) => invoke<void>('shell:openExternal', url),
  copy: (text: string) => invoke<void>('clipboard:write', text),
  openDataFolder: () => invoke<string>('paths:openRoot'),

  versions: {
    list: (force = false) => invoke<VersionList>('versions:list', force),
    onNew: (cb: (latest: VersionList['latest']) => void) => on('versions:new', cb)
  },
  settings: {
    get: () => invoke<Settings>('settings:get'),
    update: (patch: Partial<Settings>) => invoke<Settings>('settings:update', patch)
  },
  accounts: {
    list: () => invoke<PublicAccount[]>('accounts:list'),
    addOffline: (name: string) => invoke<PublicAccount>('accounts:addOffline', name),
    loginMicrosoft: () => invoke<PublicAccount>('accounts:loginMicrosoft'),
    cancelLogin: () => invoke<void>('accounts:cancelLogin'),
    remove: (id: string) => invoke<void>('accounts:remove', id),
    addAuthlib: (server: string, username: string, password: string) =>
      invoke<PublicAccount>('accounts:addAuthlib', server, username, password),
    authPresets: () => invoke<Record<string, string>>('accounts:authPresets'),
    onDeviceCode: (cb: (p: DeviceCodePrompt) => void) => on('auth:deviceCode', cb)
  },
  java: {
    detect: () => invoke<JavaInstall[]>('java:detect'),
    runtimes: () => invoke<JavaRuntimeOption[]>('java:runtimes'),
    install: (component: string) => invoke<string>('java:install', component)
  },
  instances: {
    list: () => invoke<InstanceWithState[]>('instances:list'),
    create: (name: string, versionId: string, loader?: Instance['loader']) =>
      invoke<Instance>('instances:create', name, versionId, loader),
    update: (id: string, patch: Partial<Instance>) => invoke<Instance>('instances:update', id, patch),
    remove: (id: string) => invoke<void>('instances:delete', id),
    openFolder: (id: string) => invoke<string>('instances:openFolder', id),
    launch: (id: string, accountId: string) => invoke<void>('instances:launch', id, accountId),
    kill: (id: string) => invoke<void>('instances:kill', id)
  },
  loaders: {
    versions: (type: Exclude<LoaderType, 'vanilla'>, mcVersion: string) =>
      invoke<LoaderVersion[]>('loaders:versions', type, mcVersion)
  },
  mods: {
    list: (id: string) => invoke<InstalledMod[]>('mods:list', id),
    setEnabled: (id: string, file: string, enabled: boolean) => invoke<void>('mods:setEnabled', id, file, enabled),
    remove: (id: string, file: string) => invoke<void>('mods:delete', id, file),
    search: (id: string, query: string, offset = 0) =>
      invoke<{ hits: ModSearchHit[]; total: number }>('mods:search', id, query, offset),
    install: (id: string, projectId: string) => invoke<string[]>('mods:install', id, projectId),
    openFolder: (id: string) => invoke<string>('mods:openFolder', id)
  },
  skins: {
    list: () => invoke<SkinLibrary>('skins:list'),
    save: (input: SkinSaveInput) => invoke<SkinEntry>('skins:save', input),
    setFavorite: (id: string, favorite: boolean) => invoke<void>('skins:favorite', id, favorite),
    remove: (id: string) => invoke<void>('skins:delete', id),
    /** Wear a skin with an account (null takes it off). Returns the updated library. */
    equip: (accountId: string, skinId: string | null) => invoke<SkinLibrary>('skins:equip', accountId, skinId),
    fromUsername: (username: string) => invoke<RawSkin>('skins:fromUsername', username),
    openFiles: () => invoke<RawSkin[]>('skins:openFiles'),
    /** Save a PNG where the user picks; returns the path, or null if cancelled. */
    exportPng: (name: string, png: string) => invoke<string | null>('skins:export', name, png)
  },
  /** The launcher's own updates. */
  updates: {
    get: () => invoke<UpdateInfo>('updates:get'),
    check: () => invoke<UpdateInfo>('updates:check'),
    install: () => invoke<void>('updates:install')
  },
  events: {
    onProgress: (cb: (e: ProgressEvent) => void) => on('progress', cb),
    onLog: (cb: (e: GameLogEvent) => void) => on('game:log', cb),
    onExit: (cb: (e: GameExitEvent) => void) => on('game:exit', cb),
    onStarted: (cb: (e: { instanceId: string }) => void) => on('game:started', cb),
    onWindowOpen: (cb: (e: { instanceId: string }) => void) => on('game:windowOpen', cb),
    onUpdate: (cb: (e: UpdateInfo) => void) => on('update:state', cb)
  }
}

export type LauncherApi = typeof api

contextBridge.exposeInMainWorld('launcher', api)
