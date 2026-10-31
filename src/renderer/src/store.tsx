import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { resolveLanguage, translate, type Language, type Translate } from '@shared/i18n'
import type { GameLogEvent, ProgressEvent, PublicAccount, Settings, SkinLibrary, UpdateInfo, VersionList } from '@shared/types'
import type { InstanceWithState } from '../../preload/index'
import { api, errorMessage } from './api'
import { setThemePreference } from './theme'

/** `versions` and `java` aren't in the sidebar: they open from Settings → Advanced. */
export type Page = 'home' | 'instances' | 'versions' | 'java' | 'skins' | 'settings'

/** Asked before leaving a page with unsaved work: call `proceed` to leave. */
export type LeaveGuard = (proceed: () => void) => void

export interface Toast {
  id: number
  kind: 'info' | 'error' | 'success'
  text: string
}

interface Store {
  ready: boolean
  page: Page
  /** Go to a page (through the current page's leave guard, if it set one). */
  setPage: (p: Page) => void
  setLeaveGuard: (guard: LeaveGuard | null) => void
  settings: Settings | null
  saveSettings: (patch: Partial<Settings>) => Promise<void>
  accounts: PublicAccount[]
  account: PublicAccount | null
  selectAccount: (id: string | undefined) => Promise<void>
  refreshAccounts: () => Promise<PublicAccount[]>
  instances: InstanceWithState[]
  refreshInstances: () => Promise<void>
  versions: VersionList | null
  refreshVersions: (force?: boolean) => Promise<void>
  tasks: Record<string, ProgressEvent>
  logs: GameLogEvent[]
  clearLogs: () => void
  consoleOpen: boolean
  setConsoleOpen: (open: boolean) => void
  toasts: Toast[]
  toast: (text: string, kind?: Toast['kind']) => void
  launch: (instanceId: string) => Promise<void>
  language: Language
  /** Translates a message key into the current language. */
  t: Translate
  /** Locale for dates and numbers: the system default in English, Italian formatting in Italian. */
  locale: string | undefined
  /** The launcher's own update. */
  update: UpdateInfo | null
  checkUpdates: () => Promise<void>
  /** Restart into the downloaded version, or open the downloaded installer (with a hint on what to do next). */
  installUpdate: () => Promise<void>
  /** The skin library: every skin, and which one each account wears. */
  skins: SkinLibrary | null
  setSkins: (library: SkinLibrary) => void
  refreshSkins: () => Promise<void>
}

const Ctx = createContext<Store | null>(null)
const MAX_LOG_LINES = 5000

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [page, setPageNow] = useState<Page>('home')
  const leaveGuard = useRef<LeaveGuard | null>(null)
  const setPage = useCallback((p: Page) => {
    if (leaveGuard.current) leaveGuard.current(() => setPageNow(p))
    else setPageNow(p)
  }, [])
  const setLeaveGuard = useCallback((guard: LeaveGuard | null) => {
    leaveGuard.current = guard
  }, [])
  const [skins, setSkins] = useState<SkinLibrary | null>(null)
  const refreshSkins = useCallback(async () => setSkins(await api.skins.list()), [])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [accounts, setAccounts] = useState<PublicAccount[]>([])
  const [instances, setInstances] = useState<InstanceWithState[]>([])
  const [versions, setVersions] = useState<VersionList | null>(null)
  const [tasks, setTasks] = useState<Record<string, ProgressEvent>>({})
  const [logs, setLogs] = useState<GameLogEvent[]>([])
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const updateStatus = useRef<string | undefined>(undefined)

  // Until settings load, follow the system language (in Electron the same locale the main process sees).
  const language = resolveLanguage(settings?.language, navigator.language)
  const t = useCallback<Translate>((key, vars) => translate(language, key, vars), [language])
  const locale = language === 'it' ? 'it-IT' : undefined
  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, kind, text }])
    // Confirmations go quickly; errors and hints stay long enough to read.
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 8000 : kind === 'info' ? 4500 : 3000)
  }, [])

  const refreshAccounts = useCallback(async () => {
    const list = await api.accounts.list()
    setAccounts(list)
    return list
  }, [])
  const refreshInstances = useCallback(async () => setInstances(await api.instances.list()), [])
  const refreshVersions = useCallback(
    async (force = false) => {
      try {
        setVersions(await api.versions.list(force))
      } catch (err) {
        toast(t('toast.versionsFailed', { error: errorMessage(err) }), 'error')
      }
    },
    [toast, t]
  )

  const saveSettings = useCallback(async (patch: Partial<Settings>) => {
    setSettings(await api.settings.update(patch))
  }, [])

  const theme = settings?.theme
  useEffect(() => {
    if (theme) setThemePreference(theme)
  }, [theme])

  const selectAccount = useCallback(
    async (id: string | undefined) => {
      await saveSettings({ selectedAccountId: id })
    },
    [saveSettings]
  )

  useEffect(() => {
    void (async () => {
      const [s] = await Promise.all([api.settings.get(), refreshAccounts(), refreshInstances(), refreshSkins().catch(() => undefined)])
      setSettings(s)
      setReady(true)
      await refreshVersions()
    })()
    void api.updates.get().then((info) => {
      updateStatus.current = info.state.status
      setUpdate(info)
    })
  }, [refreshAccounts, refreshInstances, refreshVersions, refreshSkins])

  useEffect(
    () =>
      api.events.onUpdate((next) => {
        if (next.state.status === 'ready' && updateStatus.current !== 'ready') {
          toast(t('update.ready', { version: next.state.version }), 'success')
        }
        updateStatus.current = next.state.status
        setUpdate(next)
      }),
    [toast, t]
  )

  const checkUpdates = useCallback(async () => {
    try {
      setUpdate(await api.updates.check())
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }, [toast])

  const installUpdate = useCallback(async () => {
    try {
      await api.updates.install()
      if (update?.method === 'installer') toast(t(api.platform === 'darwin' ? 'update.macHint' : 'update.debHint'), 'info')
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }, [toast, t, update?.method])

  useEffect(() => {
    const offs = [
      api.events.onProgress((e) => {
        setTasks((t) => ({ ...t, [e.taskId]: e }))
        if (e.finished) {
          if (e.error) toast(e.error, 'error')
          // Mods picked when an instance was made install in the background; its card counts them.
          if (e.taskId.startsWith('mods:')) void refreshInstances()
          setTimeout(() => setTasks(({ [e.taskId]: _, ...rest }) => rest), e.error ? 0 : 1200)
        }
      }),
      api.events.onLog((e) => setLogs((l) => (l.length >= MAX_LOG_LINES ? [...l.slice(-MAX_LOG_LINES / 2), e] : [...l, e]))),
      api.events.onStarted(() => void refreshInstances()),
      api.events.onWindowOpen(() => void refreshInstances()),
      api.events.onExit((e) => {
        void refreshInstances()
        if (e.code !== 0 && e.code !== null) {
          toast(t('toast.gameExited', { code: e.code }), 'error')
          setConsoleOpen(true)
        }
      }),
      api.versions.onNew((latest) => {
        toast(t('toast.newVersion', { version: latest.snapshot !== latest.release ? latest.snapshot : latest.release }), 'success')
        void refreshVersions()
      })
    ]
    return () => offs.forEach((off) => off())
  }, [refreshInstances, refreshVersions, toast, t])

  const account = useMemo(
    () => accounts.find((a) => a.id === settings?.selectedAccountId) ?? null,
    [accounts, settings?.selectedAccountId]
  )

  const launch = useCallback(
    async (instanceId: string) => {
      if (!account) return
      setLogs([])
      try {
        await saveSettings({ selectedInstanceId: instanceId })
        await api.instances.launch(instanceId, account.id)
        await refreshVersions()
      } catch (err) {
        toast(errorMessage(err), 'error')
      }
    },
    [account, refreshVersions, saveSettings, toast]
  )

  const value: Store = {
    ready,
    page,
    setPage,
    setLeaveGuard,
    settings,
    saveSettings,
    accounts,
    account,
    selectAccount,
    refreshAccounts,
    instances,
    refreshInstances,
    versions,
    refreshVersions,
    tasks,
    logs,
    clearLogs: () => setLogs([]),
    consoleOpen,
    setConsoleOpen,
    toasts,
    toast,
    launch,
    language,
    t,
    locale,
    update,
    checkUpdates,
    installUpdate,
    skins,
    setSkins,
    refreshSkins
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}
