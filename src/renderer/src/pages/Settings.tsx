import { useCallback, useEffect, useId, useMemo, useRef, useState, type InputHTMLAttributes } from 'react'
import type { LanguagePreference, MessageKey, Translate } from '@shared/i18n'
import type { Settings, ThemePreference, UpdateInfo } from '@shared/types'
import { api, errorMessage } from '../api'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { MemorySlider } from '../components/MemorySlider'
import { Toggle } from '../components/Toggle'
import { useStore } from '../store'

// Set by the back link on the Java and Versions pages, so Settings reopens at the section the player came from.
let reopenAdvanced = false

/** The back link at the top of the pages Settings → Advanced opens (Java, Versions). */
export function BackToSettings() {
  const { setPage, t } = useStore()
  return (
    <button
      className="back-link"
      onClick={() => {
        reopenAdvanced = true
        setPage('settings')
      }}
    >
      <Icon name="arrowLeft" size={16} /> {t('nav.settings')}
    </button>
  )
}

export function SettingsPage() {
  const { settings, saveSettings, accounts, account, selectAccount, refreshAccounts, toast, t, update, checkUpdates, installUpdate, instances, setPage } =
    useStore()
  const advanced = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!reopenAdvanced) return
    reopenAdvanced = false
    advanced.current?.scrollIntoView({ block: 'start' })
  }, [])
  const gameRunning = instances.some((i) => i.running)
  const updateBusy = update?.state.status === 'checking' || update?.state.status === 'downloading'
  const memoryLabel = useId()

  // Every change saves itself; "Saved" shows by the title for a moment after each save (a new key replays its fade).
  const [saved, setSaved] = useState(0)
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(savedTimer.current), [])
  const save = (patch: Partial<Settings>) =>
    saveSettings(patch).then(
      () => {
        setSaved((n) => n + 1)
        clearTimeout(savedTimer.current)
        savedTimer.current = setTimeout(() => setSaved(0), 2000)
      },
      (err) => toast(errorMessage(err), 'error')
    )

  if (!settings) return null

  return (
    <div className="page">
      {/* The title stays in view while the page scrolls, so "Saved" shows after a change further down too */}
      <div className="page-title settings-title">
        <h1>{t('nav.settings')}</h1>
        <span className="save-status" aria-live="polite">
          {saved > 0 && (
            <span key={saved} className="saved-flash">
              <Icon name="check" size={14} /> {t('settings.saved')}
            </span>
          )}
        </span>
      </div>
      <p className="muted settings-subtitle">{t('settings.subtitle')}</p>

      <section className="card settings-section">
        <h2>{t('settings.appearance')}</h2>
        <div className="field">
          <span>{t('settings.theme')}</span>
          <div className="segmented self-start">
            {THEMES.map((th) => (
              <button
                key={th.key}
                className={settings.theme === th.key ? 'active' : ''}
                aria-pressed={settings.theme === th.key}
                onClick={() => void save({ theme: th.key })}
              >
                <Icon name={th.icon} size={15} /> {t(th.label)}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>{t('settings.language')}</span>
          <div className="segmented self-start">
            {LANGUAGES.map((l) => (
              <button
                key={l.key}
                className={settings.language === l.key ? 'active' : ''}
                aria-pressed={settings.language === l.key}
                onClick={() => void save({ language: l.key })}
              >
                {l.key === 'system' ? t('settings.system') : l.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="card settings-section">
        <h2>{t('settings.accounts')}</h2>
        <div className="stack">
          {accounts.map((a) => (
            <div key={a.id} className="row gap-s account-row">
              <Avatar account={a} size={32} />
              <div className="grow">
                <strong>{a.username}</strong>
                <div className="muted">
                  {a.type === 'microsoft'
                    ? t('account.microsoftAccount')
                    : a.type === 'authlib'
                      ? t('account.serverAccount', { server: a.serverName ?? '' })
                      : t('account.offlineAccount')}
                </div>
              </div>
              {a.id === account?.id ? (
                <span className="pill pill-accent">{t('settings.active')}</span>
              ) : (
                <button className="btn btn-ghost btn-sm" onClick={() => void selectAccount(a.id)}>
                  {t('settings.use')}
                </button>
              )}
              <button
                className="icon-btn danger"
                aria-label={t('common.remove', { name: a.username })}
                onClick={async () => {
                  await api.accounts.remove(a.id)
                  await refreshAccounts()
                  if (a.id === account?.id) await selectAccount(undefined)
                }}
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
          <button className="btn btn-ghost btn-sm self-start" onClick={() => void selectAccount(undefined)}>
            <Icon name="plus" size={16} /> {t('settings.addAccount')}
          </button>
        </div>
      </section>

      <section className="card settings-section">
        <h2>{t('settings.game')}</h2>
        <div className="field">
          <span id={memoryLabel}>{t('memory.label')}</span>
          <AutoSaveMemory
            labelId={memoryLabel}
            valueMb={settings.defaultMaxMemoryMb}
            // The game starts with up to 1 GB and grows to the chosen amount.
            onSave={(mb) => void save({ defaultMaxMemoryMb: mb, defaultMinMemoryMb: Math.min(1024, mb) })}
          />
        </div>
        <Toggle label={t('settings.autoJava')} checked={settings.autoDownloadJava} onChange={(v) => void save({ autoDownloadJava: v })} />
        <Toggle label={t('settings.hideOnLaunch')} checked={settings.closeOnLaunch} onChange={(v) => void save({ closeOnLaunch: v })} />
      </section>

      <section className="card settings-section">
        <h2>{t('settings.updates')}</h2>
        <div className="update-row">
          <div className="update-meta">
            <strong>Puma Launcher {update?.current}</strong>
            <span className="muted">{updateText(update, t)}</span>
          </div>
          {update?.state.status === 'ready' ? (
            <button
              className="btn btn-primary btn-sm"
              disabled={gameRunning}
              title={gameRunning ? t('update.closeGame') : undefined}
              onClick={() => void installUpdate()}
            >
              <Icon name="download" size={16} /> {t(update.method === 'restart' ? 'update.restart' : 'update.open')}
            </button>
          ) : (
            <button className="btn btn-ghost btn-sm" disabled={!update?.supported || updateBusy} onClick={() => void checkUpdates()}>
              <Icon name="refresh" size={16} /> {t('update.check')}
            </button>
          )}
        </div>
      </section>

      <section ref={advanced} className="card settings-section">
        <h2>{t('settings.advanced')}</h2>
        <div className="setting-links">
          <SubPageLink icon="coffee" title={t('settings.java')} text={t('settings.javaHelp')} action={t('settings.open')} onOpen={() => setPage('java')} />
          <SubPageLink
            icon="layers"
            title={t('settings.versions')}
            text={t('settings.versionsHelp')}
            action={t('settings.open')}
            onOpen={() => setPage('versions')}
          />
        </div>
        <div className="form-grid">
          <label className="field">
            <span>{t('settings.refreshMinutes')}</span>
            <AutoSaveInput
              type="number"
              min={1}
              value={settings.versionRefreshMinutes}
              parse={(text) => whole(text, 1)}
              onSave={(v) => void save({ versionRefreshMinutes: v })}
            />
          </label>
          <label className="field">
            <span>{t('settings.parallel')}</span>
            <AutoSaveInput
              type="number"
              min={1}
              max={64}
              value={settings.concurrentDownloads}
              parse={(text) => whole(text, 1, 64)}
              onSave={(v) => void save({ concurrentDownloads: v })}
            />
          </label>
        </div>
        <label className="field">
          <span>{t('settings.msClientId')}</span>
          <AutoSaveInput
            value={settings.msClientId}
            placeholder="00000000-0000-0000-0000-000000000000"
            parse={(text) => text.trim()}
            onSave={(v) => void save({ msClientId: v })}
          />
          <small className="muted">{t('settings.msClientIdHelp')}</small>
        </label>
        <button className="btn btn-ghost btn-sm self-start" onClick={() => void api.openDataFolder()}>
          <Icon name="folder" size={16} /> {t('settings.openData')}
        </button>
      </section>
    </div>
  )
}

/** A row in Settings → Advanced that opens a page of its own. */
function SubPageLink({ icon, title, text, action, onOpen }: { icon: string; title: string; text: string; action: string; onOpen: () => void }) {
  const id = useId()
  return (
    <div className="setting-link">
      <span className="setting-icon">
        <Icon name={icon} />
      </span>
      <div className="setting-meta" id={id}>
        <strong>{title}</strong>
        <span className="muted">{text}</span>
      </div>
      <button className="btn btn-ghost btn-sm" aria-describedby={id} onClick={onOpen}>
        {action} <Icon name="chevron" size={14} />
      </button>
    </div>
  )
}

function updateText(update: UpdateInfo | null, t: Translate): string {
  if (!update) return ''
  if (!update.supported) return t('update.unsupported')
  const s = update.state
  switch (s.status) {
    case 'idle':
      return t('update.notChecked')
    case 'checking':
      return t('update.checking')
    case 'latest':
      return t('update.latest')
    case 'downloading':
      return t('update.downloading', { version: s.version, percent: s.percent })
    case 'ready':
      return t('update.ready', { version: s.version })
    case 'error':
      return t('update.error', { error: s.message })
  }
}

const THEMES: { key: ThemePreference; label: MessageKey; icon: string }[] = [
  { key: 'system', label: 'settings.system', icon: 'monitor' },
  { key: 'light', label: 'settings.light', icon: 'sun' },
  { key: 'dark', label: 'settings.dark', icon: 'moon' }
]

// Language names are shown in their own language, so they read the same whichever language is active.
const LANGUAGES: { key: LanguagePreference; label: string }[] = [
  { key: 'system', label: '' },
  { key: 'en', label: 'English' },
  { key: 'it', label: 'Italiano' }
]

/** A whole number typed in a box, kept between `min` and `max`; undefined while the box is empty. */
function whole(text: string, min: number, max = Infinity): number | undefined {
  const n = Number(text)
  if (text.trim() === '' || !Number.isFinite(n)) return undefined
  return Math.min(max, Math.max(min, Math.round(n)))
}

/**
 * Runs `fn` with the latest arguments once calls stop for a moment (`flush` runs a waiting call at once). A call still
 * waiting when the page closes runs then, so a change made just before leaving Settings is kept.
 */
function useDebounced<A extends unknown[]>(fn: (...args: A) => void, ms = 600) {
  const latest = useRef(fn)
  useEffect(() => {
    latest.current = fn
  })
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const waiting = useRef<A | null>(null)
  const flush = useCallback(() => {
    clearTimeout(timer.current)
    const args = waiting.current
    waiting.current = null
    if (args) latest.current(...args)
  }, [])
  const run = useCallback(
    (...args: A) => {
      waiting.current = args
      clearTimeout(timer.current)
      timer.current = setTimeout(flush, ms)
    },
    [flush, ms]
  )
  useEffect(() => flush, [flush])
  return useMemo(() => ({ run, flush, isWaiting: () => waiting.current !== null }), [run, flush])
}

type AutoSaveInputProps<T> = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: T
  /** What to save for the typed text (cleaned up and kept in range), or undefined while it isn't a value yet. */
  parse: (text: string) => T | undefined
  onSave: (value: T) => void
}

/** A text or number box that saves itself: on Enter, when it loses focus, and after a short pause in typing. */
function AutoSaveInput<T extends string | number>({ value, parse, onSave, ...input }: AutoSaveInputProps<T>) {
  const [text, setText] = useState(String(value))
  const focused = useRef(false)
  // Show the stored value, except over what's being typed.
  useEffect(() => {
    if (!focused.current) setText(String(value))
  }, [value])
  const commit = useDebounced((typed: string) => {
    const next = parse(typed)
    if (next !== undefined && next !== value) onSave(next)
  })
  // Saves now, and shows the value the way it's stored (an empty box gets the stored value back).
  const finish = () => {
    commit.flush()
    setText(String(parse(text) ?? value))
  }
  return (
    <input
      {...input}
      value={text}
      onFocus={() => (focused.current = true)}
      onChange={(e) => {
        setText(e.target.value)
        commit.run(e.target.value)
      }}
      onBlur={() => {
        focused.current = false
        finish()
      }}
      onKeyDown={(e) => e.key === 'Enter' && finish()}
    />
  )
}

/** The memory slider in Settings: it moves at once, and saves once it stops moving. */
function AutoSaveMemory({ labelId, valueMb, onSave }: { labelId: string; valueMb: number; onSave: (mb: number) => void }) {
  const [mb, setMb] = useState(valueMb)
  const commit = useDebounced(onSave)
  // Follow the stored value, but not back to an older one while a newer one waits to be saved.
  useEffect(() => {
    if (!commit.isWaiting()) setMb(valueMb)
  }, [valueMb, commit])
  return (
    <MemorySlider
      labelId={labelId}
      valueMb={mb}
      onChange={(next) => {
        setMb(next)
        commit.run(next)
      }}
    />
  )
}
