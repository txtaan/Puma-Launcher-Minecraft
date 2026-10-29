// In-browser stand-in for the Electron preload bridge (window.launcher), so the real React UI can run
// in a normal browser with sample data. Used by `npm run preview:web` for UI work; not part of the app.
import type {
  DeviceCodePrompt,
  GameExitEvent,
  GameLogEvent,
  InstalledMod,
  Instance,
  JavaInstall,
  JavaRuntimeOption,
  LoaderType,
  LoaderVersion,
  ModSearchHit,
  ProgressEvent,
  PublicAccount,
  Settings,
  VersionList
} from '../src/shared/types'
import type { InstanceWithState, LauncherApi } from '../src/preload/index'
import sample from './sample-data.json'
import { resolveLanguage, translate, type MessageKey } from '../src/shared/i18n'

type Listener<T> = (payload: T) => void
const listeners = new Map<string, Set<Listener<unknown>>>()
function on<T>(channel: string, cb: Listener<T>): () => void {
  if (!listeners.has(channel)) listeners.set(channel, new Set())
  listeners.get(channel)!.add(cb as Listener<unknown>)
  return () => listeners.get(channel)!.delete(cb as Listener<unknown>)
}
function emit<T>(channel: string, payload: T): void {
  listeners.get(channel)?.forEach((cb) => cb(payload))
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const uuid = () => crypto.randomUUID()

let settings: Settings = {
  msClientId: '',
  theme: 'dark',
  language: 'system',
  defaultMaxMemoryMb: 4096,
  defaultMinMemoryMb: 512,
  autoDownloadJava: true,
  versionRefreshMinutes: 10,
  concurrentDownloads: 16,
  closeOnLaunch: false
}
// Text the real main process would produce comes from the shared dictionary, in the language picked in Settings.
const tr = (key: MessageKey, vars?: Record<string, string | number>) =>
  translate(resolveLanguage(settings.language, navigator.language), key, vars)
const previewOnly = (en: string, it: string) => (resolveLanguage(settings.language, navigator.language) === 'it' ? it : en)

let accounts: PublicAccount[] = []
const installedVersions = new Set<string>()
const instances: Instance[] = []
const running = new Set<string>()
const mods = new Map<string, (InstalledMod & { projectId: string })[]>()
const javaInstalled = new Set<string>()

const versionList = (): VersionList => ({
  latest: sample.versionList.latest,
  fetchedAt: Date.now(),
  versions: sample.versionList.versions.map((v) => ({
    ...v,
    type: v.type as VersionList['versions'][number]['type'],
    url: '',
    sha1: '',
    installed: installedVersions.has(v.id)
  }))
})

/** Fake a multi-stage download, reporting progress like the real main process does. */
async function simulate(taskId: string, title: string, stages: [string, number][]): Promise<void> {
  for (const [stage, total] of stages) {
    const step = Math.max(1, Math.round(total / 18))
    for (let done = 0; done <= total; done += step) {
      emit<ProgressEvent>('progress', { taskId, title, stage, done: Math.min(done, total), total })
      await wait(60)
    }
  }
  emit<ProgressEvent>('progress', { taskId, title, stage: tr('task.done'), done: 1, total: 1, finished: true })
}

const javaMajorFor = (versionId: string): number => {
  const v = sample.versionList.versions.find((x) => x.id === versionId)
  const t = v ? Date.parse(v.releaseTime) : Date.now()
  if (t >= Date.parse('2025-12-01')) return 25
  if (t >= Date.parse('2024-04-23')) return 21
  if (t >= Date.parse('2021-11-30')) return 17
  return 8
}

const runtimes: JavaRuntimeOption[] = [
  { component: 'adoptium-27', vendor: 'adoptium', version: 'Temurin 27', majorVersion: 27, installed: false },
  { component: 'java-runtime-epsilon', vendor: 'mojang', version: '25.0.1', majorVersion: 25, installed: false },
  { component: 'java-runtime-delta', vendor: 'mojang', version: '21.0.7', majorVersion: 21, installed: false },
  { component: 'java-runtime-gamma', vendor: 'mojang', version: '17.0.15', majorVersion: 17, installed: false },
  { component: 'java-runtime-alpha', vendor: 'mojang', version: '16.0.1.9.1', majorVersion: 16, installed: false },
  { component: 'adoptium-11', vendor: 'adoptium', version: 'Temurin 11', majorVersion: 11, installed: false },
  { component: 'jre-legacy', vendor: 'mojang', version: '8u202', majorVersion: 8, installed: false }
]
const componentFor = (major: number) => runtimes.find((r) => r.majorVersion === major)!.component

async function prepareJava(inst: Instance): Promise<void> {
  const component = componentFor(javaMajorFor(inst.versionId))
  if (inst.javaPath || javaInstalled.has(component)) return
  await simulate(`java-prepare:${inst.id}`, tr('task.javaFor', { name: inst.name }), [[tr('stage.downloadingJava', { version: javaMajorFor(inst.versionId) }), 147]])
  javaInstalled.add(component)
}

const GAME_LOG = [
  'Loading Minecraft {v}{loader}',
  'Setting user: {user}',
  'Backend library: LWJGL version 3.4.3+4',
  'Using graphics backend OpenGL',
  'Reloading ResourceManager: vanilla{mods}',
  'Sound engine started',
  'Created: 1024x512x4 minecraft:textures/atlas/blocks.png-atlas',
  'Loaded 1407 recipes',
  'Loaded 1520 advancements'
]

const api: LauncherApi = {
  platform: 'win32',
  window: { minimize: () => undefined, maximize: () => undefined, close: () => undefined },
  openExternal: async (url) => void window.open(url, '_blank'),
  copy: async (text) => void (await navigator.clipboard?.writeText(text).catch(() => undefined)),
  openDataFolder: async () => '',

  versions: {
    list: async () => versionList(),
    onNew: (cb) => on('versions:new', cb)
  },
  settings: {
    get: async () => settings,
    update: async (patch) => (settings = { ...settings, ...patch })
  },
  accounts: {
    list: async () => accounts,
    addOffline: async (name) => {
      const username = name.trim()
      if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) {
        throw new Error(tr('error.username'))
      }
      const existing = accounts.find((a) => a.type === 'offline' && a.username === username)
      if (existing) return existing
      const acc: PublicAccount = { id: uuid(), type: 'offline', username, uuid: uuid().replace(/-/g, '') }
      accounts = [...accounts, acc]
      return acc
    },
    loginMicrosoft: async () => {
      throw new Error(previewOnly('Microsoft login is not available in this browser preview. Use “Play offline”.', 'L’accesso Microsoft non è disponibile in questa anteprima nel browser. Usa “Gioca offline”.'))
    },
    cancelLogin: async () => undefined,
    remove: async (id) => void (accounts = accounts.filter((a) => a.id !== id)),
    addAuthlib: async () => {
      throw new Error(previewOnly('Third-party login is not available in this browser preview. Use “Play offline”.', 'L’accesso con server di terze parti non è disponibile in questa anteprima nel browser. Usa “Gioca offline”.'))
    },
    authPresets: async () => ({
      'Ely.by': 'https://authserver.ely.by/api/authlib-injector',
      LittleSkin: 'https://littleskin.cn/api/yggdrasil'
    }),
    onDeviceCode: (cb: (p: DeviceCodePrompt) => void) => on('auth:deviceCode', cb)
  },
  java: {
    detect: async (): Promise<JavaInstall[]> => [
      ...runtimes
        .filter((r) => javaInstalled.has(r.component))
        .map<JavaInstall>((r) => ({ path: `C:\\Users\\you\\AppData\\Roaming\\puma-launcher\\runtime\\${r.component}\\bin\\java.exe`, version: r.version, majorVersion: r.majorVersion, arch: 'amd64', source: 'managed' })),
      { path: 'C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.5+11\\bin\\java.exe', version: '21.0.5', majorVersion: 21, arch: 'amd64', source: 'system' }
    ],
    runtimes: async () => runtimes.map((r) => ({ ...r, installed: javaInstalled.has(r.component) })),
    install: async (component) => {
      const r = runtimes.find((x) => x.component === component)!
      await simulate(`java:${component}`, tr('task.installing', { name: component }), [[tr('stage.downloadingJava', { version: r.version }), 147]])
      javaInstalled.add(component)
      return ''
    }
  },
  instances: {
    list: async (): Promise<InstanceWithState[]> =>
      [...instances]
        .sort((a, b) => (b.lastPlayed ?? b.createdAt) - (a.lastPlayed ?? a.createdAt))
        .map((i) => ({ ...i, running: running.has(i.id) })),
    create: async (name, versionId, loader) => {
      const inst: Instance = { id: uuid(), name: name.trim() || versionId, versionId, loader, createdAt: Date.now() }
      instances.push(inst)
      void prepareJava(inst)
      return inst
    },
    update: async (id, patch) => {
      const i = instances.findIndex((x) => x.id === id)
      instances[i] = { ...instances[i], ...patch, id }
      return instances[i]
    },
    remove: async (id) => {
      const i = instances.findIndex((x) => x.id === id)
      if (i >= 0) instances.splice(i, 1)
    },
    openFolder: async () => '',
    launch: async (id) => {
      const inst = instances.find((x) => x.id === id)!
      const first = !installedVersions.has(inst.versionId)
      await simulate(`launch:${id}`, tr('task.launching', { name: inst.name }), [
        [tr('stage.resolvingVersion'), 1],
        [tr('stage.downloadingFiles'), first ? 68 : 1],
        [tr('stage.downloadingAssets'), first ? 4200 : 1],
        [tr('stage.preparingNatives'), 1]
      ])
      installedVersions.add(inst.versionId)
      running.add(id)
      inst.lastPlayed = Date.now()
      emit('game:started', { instanceId: id })
      const loader = inst.loader ? ` with ${inst.loader.type} ${inst.loader.version}` : ''
      const modCount = mods.get(id)?.filter((m) => m.enabled).length ?? 0
      const launchLine = tr('log.launching', { version: inst.versionId, loader: inst.loader ? ` + ${inst.loader.type} ${inst.loader.version}` : '', java: 'java' })
      const note = previewOnly('browser preview: no real game is started', 'anteprima nel browser: nessuna partita viene avviata davvero')
      emit<GameLogEvent>('game:log', { instanceId: id, stream: 'launcher', line: `${launchLine} (${note})` })
      for (const line of GAME_LOG) {
        await wait(250)
        const text = line
          .replace('{v}', inst.versionId)
          .replace('{loader}', loader)
          .replace('{user}', settings.selectedAccountId ? accounts.find((a) => a.id === settings.selectedAccountId)?.username ?? '' : '')
          .replace('{mods}', modCount ? `, ${modCount} mod(s)` : '')
        emit<GameLogEvent>('game:log', { instanceId: id, stream: 'stdout', line: `[${new Date().toTimeString().slice(0, 8)}] [Render thread/INFO]: ${text}` })
      }
    },
    kill: async (id) => {
      running.delete(id)
      emit<GameExitEvent>('game:exit', { instanceId: id, code: 0 })
    }
  },
  loaders: {
    versions: async (type: Exclude<LoaderType, 'vanilla'>, mcVersion: string): Promise<LoaderVersion[]> => {
      await wait(250)
      if (type === 'fabric' || type === 'quilt') return sample.loaders[type]
      return (sample.loaders[type] as Record<string, LoaderVersion[]>)[mcVersion] ?? []
    }
  },
  mods: {
    list: async (id) => (mods.get(id) ?? []).map((m) => ({ ...m })),
    setEnabled: async (id, file, enabled) => {
      const m = mods.get(id)?.find((x) => x.fileName === file)
      if (m) {
        m.enabled = enabled
        m.fileName = enabled ? m.fileName.replace(/\.disabled$/, '') : `${m.fileName}.disabled`
      }
    },
    remove: async (id, file) => void mods.set(id, (mods.get(id) ?? []).filter((m) => m.fileName !== file)),
    search: async (id, query, offset = 0) => {
      await wait(200)
      const inst = instances.find((x) => x.id === id)!
      if (!inst.loader) throw new Error(tr('error.needLoader'))
      const installed = new Set((mods.get(id) ?? []).map((m) => m.projectId))
      const q = query.toLowerCase()
      const hits: ModSearchHit[] = sample.mods
        .filter((m) => !q || m.title.toLowerCase().includes(q) || m.description.toLowerCase().includes(q))
        .map((m) => ({ ...m, installed: installed.has(m.projectId) }))
      return { hits: hits.slice(offset, offset + 20), total: hits.length }
    },
    install: async (id, projectId) => {
      await wait(700)
      const m = sample.mods.find((x) => x.projectId === projectId)!
      const list = mods.get(id) ?? []
      const fileName = `${m.slug}-latest.jar`
      if (!list.some((x) => x.projectId === projectId)) list.push({ fileName, enabled: true, name: m.title, version: 'latest', projectId })
      mods.set(id, list)
      return [fileName]
    },
    openFolder: async () => ''
  },
  events: {
    onProgress: (cb) => on('progress', cb),
    onLog: (cb) => on('game:log', cb),
    onExit: (cb) => on('game:exit', cb),
    onStarted: (cb) => on('game:started', cb)
  }
}

;(window as unknown as { launcher: LauncherApi }).launcher = api
