import { useEffect, useRef, useState } from 'react'
import type { DeviceCodePrompt } from '@shared/types'
import { api, errorMessage } from '../api'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { rich } from '../rich'
import { useStore } from '../store'

export function Login() {
  const { accounts, refreshAccounts, selectAccount, toast, settings, t } = useStore()
  const [mode, setMode] = useState<'choose' | 'offline' | 'microsoft' | 'server'>('choose')
  const [presets, setPresets] = useState<Record<string, string>>({})
  const [server, setServer] = useState('https://authserver.ely.by/api/authlib-injector')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [prompt, setPrompt] = useState<DeviceCodePrompt | null>(null)
  // Set when the user cancels a Microsoft sign-in, so its "cancelled" error isn't shown.
  const cancelled = useRef(false)

  useEffect(() => api.accounts.onDeviceCode(setPrompt), [])
  useEffect(() => void api.accounts.authPresets().then(setPresets), [])

  const loginServer = async () => {
    setBusy(true)
    setError('')
    try {
      const acc = await api.accounts.addAuthlib(server, username, password)
      setPassword('')
      toast(t('login.signedInServer', { name: acc.username, server: acc.serverName ?? '' }), 'success')
      await finish(acc.id)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const finish = async (id: string) => {
    await refreshAccounts()
    await selectAccount(id)
  }

  const loginOffline = async () => {
    setBusy(true)
    setError('')
    try {
      const acc = await api.accounts.addOffline(username)
      await finish(acc.id)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const loginMicrosoft = async () => {
    setMode('microsoft')
    cancelled.current = false
    setBusy(true)
    setError('')
    setPrompt(null)
    try {
      const acc = await api.accounts.loginMicrosoft()
      toast(t('login.signedIn', { name: acc.username }), 'success')
      await finish(acc.id)
    } catch (err) {
      if (!cancelled.current) setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const cancel = () => {
    cancelled.current = true
    void api.accounts.cancelLogin()
    setMode('choose')
    setPrompt(null)
    setBusy(false)
    setError('')
  }

  return (
    <div className="login">
      <div className="login-bg" aria-hidden>
        <div className="login-art" />
      </div>
      <div className="login-card glass">
        <div className="login-logo">
          <span className="brand-mark big" />
        </div>
        <h1>{t('login.welcome')}</h1>
        <p className="muted">{t('login.subtitle')}</p>

        {mode === 'choose' && (
          <>
            {accounts.length > 0 && (
              <div className="saved-accounts">
                {accounts.map((a) => (
                  <div key={a.id} className="saved-account">
                    <button className="saved-account-main" onClick={() => void selectAccount(a.id)}>
                      <Avatar account={a} size={32} />
                      <div>
                        <strong>{a.username}</strong>
                        <span>{a.type === 'microsoft' ? t('account.microsoftAccount') : a.type === 'authlib' ? a.serverName : t('account.offline')}</span>
                      </div>
                    </button>
                    <button
                      className="icon-btn"
                      aria-label={t('common.remove', { name: a.username })}
                      onClick={async () => {
                        await api.accounts.remove(a.id)
                        await refreshAccounts()
                      }}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                ))}
                <div className="divider">
                  <span>{t('login.orAdd')}</span>
                </div>
              </div>
            )}
            <button className="btn btn-primary btn-lg w-full" onClick={() => void loginMicrosoft()}>
              <MicrosoftLogo /> {t('login.microsoft')}
            </button>
            <button className="btn btn-ghost btn-lg w-full" onClick={() => setMode('offline')}>
              <Icon name="user" /> {t('login.offline')}
            </button>
            <button className="btn btn-ghost w-full" onClick={() => setMode('server')}>
              <Icon name="server" /> {t('login.server')}
            </button>
            {!settings?.msClientId && (
              <p className="hint">{t('login.msHint')}</p>
            )}
          </>
        )}

        {mode === 'offline' && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault()
              void loginOffline()
            }}
          >
            <label className="field">
              <span>{t('login.username')}</span>
              <input autoFocus value={username} maxLength={16} placeholder="Steve" onChange={(e) => setUsername(e.target.value)} />
            </label>
            <button className="btn btn-primary btn-lg w-full" disabled={busy || username.length < 3}>
              {t('login.continue')}
            </button>
            <button type="button" className="btn btn-ghost w-full" onClick={cancel}>
              {t('common.back')}
            </button>
          </form>
        )}

        {mode === 'server' && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault()
              void loginServer()
            }}
          >
            <label className="field">
              <span>{t('login.authServer')}</span>
              <select
                value={Object.values(presets).includes(server) ? server : '__custom'}
                onChange={(e) => setServer(e.target.value === '__custom' ? '' : e.target.value)}
              >
                {Object.entries(presets).map(([name, url]) => (
                  <option key={url} value={url}>
                    {name}
                  </option>
                ))}
                <option value="__custom">{t('login.customServer')}</option>
              </select>
            </label>
            {!Object.values(presets).includes(server) && (
              <label className="field">
                <span>{t('login.serverUrl')}</span>
                <input value={server} placeholder="https://example.com/api/yggdrasil" onChange={(e) => setServer(e.target.value)} />
              </label>
            )}
            <label className="field">
              <span>{t('login.emailOrUsername')}</span>
              <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
            </label>
            <label className="field">
              <span>{t('login.password')}</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <button className="btn btn-primary btn-lg w-full" disabled={busy || !username || !password || !server}>
              {busy ? t('login.signingIn') : t('login.signIn')}
            </button>
            <button type="button" className="btn btn-ghost w-full" onClick={cancel}>
              {t('common.back')}
            </button>
          </form>
        )}

        {mode === 'microsoft' && (
          <div className="stack">
            {!prompt && !error && (
              <div className="center muted">
                <span className="spinner" /> {t('login.contacting')}
              </div>
            )}
            {prompt && (
              <div className="device-code">
                <p>{rich(t('login.openAndEnter'), { url: <strong>{prompt.verificationUri}</strong> })}</p>
                <div className="code">{prompt.userCode}</div>
                <div className="row gap-s center">
                  <button className="btn btn-ghost btn-sm" onClick={() => void api.copy(prompt.userCode)}>
                    <Icon name="copy" size={16} /> {t('login.copyCode')}
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => void api.openExternal(prompt.verificationUri)}>
                    <Icon name="external" size={16} /> {t('login.openBrowser')}
                  </button>
                </div>
                {busy && (
                  <p className="muted center">
                    <span className="spinner sm" /> {t('login.waiting')}
                  </p>
                )}
              </div>
            )}
            <button className="btn btn-ghost w-full" onClick={cancel}>
              {error ? t('common.back') : t('common.cancel')}
            </button>
          </div>
        )}

        {error && <div className="error-box">{error}</div>}
      </div>
    </div>
  )
}

function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}
