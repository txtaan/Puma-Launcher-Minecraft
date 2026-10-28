import { useEffect, useState } from 'react'
import type { DeviceCodePrompt } from '@shared/types'
import { api, errorMessage } from '../api'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { useStore } from '../store'

export function Login() {
  const { accounts, refreshAccounts, selectAccount, toast, settings } = useStore()
  const [mode, setMode] = useState<'choose' | 'offline' | 'microsoft' | 'server'>('choose')
  const [presets, setPresets] = useState<Record<string, string>>({})
  const [server, setServer] = useState('https://authserver.ely.by/api/authlib-injector')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [prompt, setPrompt] = useState<DeviceCodePrompt | null>(null)

  useEffect(() => api.accounts.onDeviceCode(setPrompt), [])
  useEffect(() => void api.accounts.authPresets().then(setPresets), [])

  const loginServer = async () => {
    setBusy(true)
    setError('')
    try {
      const acc = await api.accounts.addAuthlib(server, username, password)
      setPassword('')
      toast(`Signed in as ${acc.username} (${acc.serverName})`, 'success')
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
    setBusy(true)
    setError('')
    setPrompt(null)
    try {
      const acc = await api.accounts.loginMicrosoft()
      toast(`Signed in as ${acc.username}`, 'success')
      await finish(acc.id)
    } catch (err) {
      const msg = errorMessage(err)
      if (msg !== 'Login cancelled') setError(msg)
    } finally {
      setBusy(false)
    }
  }

  const cancel = () => {
    void api.accounts.cancelLogin()
    setMode('choose')
    setPrompt(null)
    setBusy(false)
    setError('')
  }

  return (
    <div className="login">
      <div className="login-bg" aria-hidden>
        <span className="blob b1" />
        <span className="blob b2" />
        <span className="blob b3" />
      </div>
      <div className="login-card glass">
        <div className="login-logo">
          <span className="brand-mark big" />
        </div>
        <h1>Welcome</h1>
        <p className="muted">Sign in to start playing Minecraft</p>

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
                        <span>{a.type === 'microsoft' ? 'Microsoft account' : a.type === 'authlib' ? a.serverName : 'Offline'}</span>
                      </div>
                    </button>
                    <button
                      className="icon-btn"
                      aria-label={`Remove ${a.username}`}
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
                  <span>or add an account</span>
                </div>
              </div>
            )}
            <button className="btn btn-primary btn-lg w-full" onClick={() => void loginMicrosoft()}>
              <MicrosoftLogo /> Sign in with Microsoft
            </button>
            <button className="btn btn-ghost btn-lg w-full" onClick={() => setMode('offline')}>
              <Icon name="user" /> Play offline
            </button>
            <button className="btn btn-ghost w-full" onClick={() => setMode('server')}>
              <Icon name="server" /> Ely.by, LittleSkin or other server
            </button>
            {!settings?.msClientId && (
              <p className="hint">
                Microsoft login needs an Azure client ID. You can add it later in Settings; offline mode works right away.
              </p>
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
              <span>Username</span>
              <input autoFocus value={username} maxLength={16} placeholder="Steve" onChange={(e) => setUsername(e.target.value)} />
            </label>
            <button className="btn btn-primary btn-lg w-full" disabled={busy || username.length < 3}>
              Continue
            </button>
            <button type="button" className="btn btn-ghost w-full" onClick={cancel}>
              Back
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
              <span>Authentication server</span>
              <select
                value={Object.values(presets).includes(server) ? server : '__custom'}
                onChange={(e) => setServer(e.target.value === '__custom' ? '' : e.target.value)}
              >
                {Object.entries(presets).map(([name, url]) => (
                  <option key={url} value={url}>
                    {name}
                  </option>
                ))}
                <option value="__custom">Custom (authlib-injector URL)…</option>
              </select>
            </label>
            {!Object.values(presets).includes(server) && (
              <label className="field">
                <span>Server URL</span>
                <input value={server} placeholder="https://example.com/api/yggdrasil" onChange={(e) => setServer(e.target.value)} />
              </label>
            )}
            <label className="field">
              <span>Email or username</span>
              <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
            </label>
            <label className="field">
              <span>Password</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <button className="btn btn-primary btn-lg w-full" disabled={busy || !username || !password || !server}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <button type="button" className="btn btn-ghost w-full" onClick={cancel}>
              Back
            </button>
          </form>
        )}

        {mode === 'microsoft' && (
          <div className="stack">
            {!prompt && !error && (
              <div className="center muted">
                <span className="spinner" /> Contacting Microsoft…
              </div>
            )}
            {prompt && (
              <div className="device-code">
                <p>
                  Open <strong>{prompt.verificationUri}</strong> and enter this code:
                </p>
                <div className="code">{prompt.userCode}</div>
                <div className="row gap-s center">
                  <button className="btn btn-ghost btn-sm" onClick={() => void api.copy(prompt.userCode)}>
                    <Icon name="copy" size={16} /> Copy code
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => void api.openExternal(prompt.verificationUri)}>
                    <Icon name="external" size={16} /> Open browser
                  </button>
                </div>
                {busy && (
                  <p className="muted center">
                    <span className="spinner sm" /> Waiting for you to finish signing in…
                  </p>
                )}
              </div>
            )}
            <button className="btn btn-ghost w-full" onClick={cancel}>
              {error ? 'Back' : 'Cancel'}
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
