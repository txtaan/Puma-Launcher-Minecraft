import { useEffect, useState } from 'react'
import type { Settings } from '@shared/types'
import { api, errorMessage } from '../api'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { useStore } from '../store'

export function SettingsPage() {
  const { settings, saveSettings, accounts, account, selectAccount, refreshAccounts, toast } = useStore()
  const [draft, setDraft] = useState<Settings | null>(settings)
  useEffect(() => setDraft(settings), [settings])
  if (!draft) return null

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setDraft({ ...draft, [k]: v })
  const save = async () => {
    try {
      await saveSettings(draft)
      toast('Settings saved', 'success')
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">Defaults apply to every instance unless overridden in the instance settings.</p>
        </div>
        <button className="btn btn-primary" onClick={() => void save()}>
          Save changes
        </button>
      </div>

      <section className="card settings-section">
        <h2>Accounts</h2>
        <div className="stack">
          {accounts.map((a) => (
            <div key={a.id} className="row gap-s account-row">
              <Avatar account={a} size={32} />
              <div className="grow">
                <strong>{a.username}</strong>
                <div className="muted">{a.type === 'microsoft' ? 'Microsoft account' : a.type === 'authlib' ? `${a.serverName} account` : 'Offline account'}</div>
              </div>
              {a.id === account?.id ? (
                <span className="pill pill-accent">Active</span>
              ) : (
                <button className="btn btn-ghost btn-sm" onClick={() => void selectAccount(a.id)}>
                  Use
                </button>
              )}
              <button
                className="icon-btn danger"
                aria-label={`Remove ${a.username}`}
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
            <Icon name="plus" size={16} /> Add another account
          </button>
        </div>
        <label className="field">
          <span>Microsoft login — Azure application (client) ID</span>
          <input value={draft.msClientId} placeholder="00000000-0000-0000-0000-000000000000" onChange={(e) => set('msClientId', e.target.value.trim())} />
          <small className="muted">
            Register a free app in the Azure portal (personal Microsoft accounts, public client / device code flow enabled), then
            request Minecraft API access from Mojang. See README for details.
          </small>
        </label>
      </section>

      <section className="card settings-section">
        <h2>Game</h2>
        <div className="form-grid">
          <label className="field">
            <span>Default min memory (MB)</span>
            <input type="number" value={draft.defaultMinMemoryMb} onChange={(e) => set('defaultMinMemoryMb', Number(e.target.value))} />
          </label>
          <label className="field">
            <span>Default max memory (MB)</span>
            <input type="number" value={draft.defaultMaxMemoryMb} onChange={(e) => set('defaultMaxMemoryMb', Number(e.target.value))} />
          </label>
        </div>
        <Toggle label="Let the launcher download Java (recommended). When off, Java installed on this PC is used" checked={draft.autoDownloadJava} onChange={(v) => set('autoDownloadJava', v)} />
        <Toggle label="Hide launcher while the game is running" checked={draft.closeOnLaunch} onChange={(v) => set('closeOnLaunch', v)} />
      </section>

      <section className="card settings-section">
        <h2>Downloads & updates</h2>
        <div className="form-grid">
          <label className="field">
            <span>Check Mojang for new versions every (minutes)</span>
            <input type="number" min={1} value={draft.versionRefreshMinutes} onChange={(e) => set('versionRefreshMinutes', Math.max(1, Number(e.target.value)))} />
          </label>
          <label className="field">
            <span>Parallel downloads</span>
            <input type="number" min={1} max={64} value={draft.concurrentDownloads} onChange={(e) => set('concurrentDownloads', Math.min(64, Math.max(1, Number(e.target.value))))} />
          </label>
        </div>
        <button className="btn btn-ghost btn-sm self-start" onClick={() => void api.openDataFolder()}>
          <Icon name="folder" size={16} /> Open launcher data folder
        </button>
      </section>
    </div>
  )
}

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
