import { useState } from 'react'
import type { LanguagePreference, MessageKey } from '@shared/i18n'
import type { Settings, ThemePreference } from '@shared/types'
import { api, errorMessage } from '../api'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { useStore } from '../store'

export function SettingsPage() {
  const { settings, saveSettings, accounts, account, selectAccount, refreshAccounts, toast, t } = useStore()
  // Only unsaved edits live here, so settings that apply instantly (theme, accounts) don't discard them.
  const [edits, setEdits] = useState<Partial<Settings>>({})
  if (!settings) return null
  const draft = { ...settings, ...edits }

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setEdits({ ...edits, [k]: v })
  const save = async () => {
    try {
      await saveSettings(edits)
      setEdits({})
      toast(t('settings.saved'), 'success')
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('nav.settings')}</h1>
          <p className="muted">{t('settings.subtitle')}</p>
        </div>
        <button className="btn btn-primary" onClick={() => void save()}>
          {t('settings.save')}
        </button>
      </div>

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
                onClick={() => void saveSettings({ theme: th.key }).catch((err) => toast(errorMessage(err), 'error'))}
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
                onClick={() => void saveSettings({ language: l.key }).catch((err) => toast(errorMessage(err), 'error'))}
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
        <label className="field">
          <span>{t('settings.msClientId')}</span>
          <input value={draft.msClientId} placeholder="00000000-0000-0000-0000-000000000000" onChange={(e) => set('msClientId', e.target.value.trim())} />
          <small className="muted">{t('settings.msClientIdHelp')}</small>
        </label>
      </section>

      <section className="card settings-section">
        <h2>{t('settings.game')}</h2>
        <div className="form-grid">
          <label className="field">
            <span>{t('settings.minMemory')}</span>
            <input type="number" value={draft.defaultMinMemoryMb} onChange={(e) => set('defaultMinMemoryMb', Number(e.target.value))} />
          </label>
          <label className="field">
            <span>{t('settings.maxMemory')}</span>
            <input type="number" value={draft.defaultMaxMemoryMb} onChange={(e) => set('defaultMaxMemoryMb', Number(e.target.value))} />
          </label>
        </div>
        <Toggle label={t('settings.autoJava')} checked={draft.autoDownloadJava} onChange={(v) => set('autoDownloadJava', v)} />
        <Toggle label={t('settings.hideOnLaunch')} checked={draft.closeOnLaunch} onChange={(v) => set('closeOnLaunch', v)} />
      </section>

      <section className="card settings-section">
        <h2>{t('settings.downloads')}</h2>
        <div className="form-grid">
          <label className="field">
            <span>{t('settings.refreshMinutes')}</span>
            <input type="number" min={1} value={draft.versionRefreshMinutes} onChange={(e) => set('versionRefreshMinutes', Math.max(1, Number(e.target.value)))} />
          </label>
          <label className="field">
            <span>{t('settings.parallel')}</span>
            <input type="number" min={1} max={64} value={draft.concurrentDownloads} onChange={(e) => set('concurrentDownloads', Math.min(64, Math.max(1, Number(e.target.value))))} />
          </label>
        </div>
        <button className="btn btn-ghost btn-sm self-start" onClick={() => void api.openDataFolder()}>
          <Icon name="folder" size={16} /> {t('settings.openData')}
        </button>
      </section>
    </div>
  )
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

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>
      {label}
    </label>
  )
}
