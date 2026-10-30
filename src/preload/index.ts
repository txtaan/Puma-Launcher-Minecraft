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
  RecommendedMod,
  JavaRuntimeOption,
  ProgressEvent,
  PublicAccount,
  Settings,
  VersionList
} from '@shared/types'

const invoke = <T>(channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args) as Promise<T>

function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

export type InstanceWithState = Instance & { running: boolean }

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
    create: (name: string, versionId: string, loader?: Instance['loader'], modIds: string[] = []) =>
      invoke<Instance>('instances:create', name, versionId, loader, modIds),
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
    recommended: (type: Exclude<LoaderType, 'vanilla'>, mcVersion: string) =>
      invoke<RecommendedMod[]>('mods:recommended', type, mcVersion),
    setEnabled: (id: string, file: string, enabled: boolean) => invoke<void>('mods:setEnabled', id, file, enabled),
    remove: (id: string, file: string) => invoke<void>('mods:delete', id, file),
    search: (id: string, query: string, offset = 0) =>
      invoke<{ hits: ModSearchHit[]; total: number }>('mods:search', id, query, offset),
    install: (id: string, projectId: string) => invoke<string[]>('mods:install', id, projectId),
    openFolder: (id: string) => invoke<string>('mods:openFolder', id)
  },
  events: {
    onProgress: (cb: (e: ProgressEvent) => void) => on('progress', cb),
    onLog: (cb: (e: GameLogEvent) => void) => on('game:log', cb),
    onExit: (cb: (e: GameExitEvent) => void) => on('game:exit', cb),
    onStarted: (cb: (e: { instanceId: string }) => void) => on('game:started', cb)
  }
}

export type LauncherApi = typeof api

contextBridge.exposeInMainWorld('launcher', api)
