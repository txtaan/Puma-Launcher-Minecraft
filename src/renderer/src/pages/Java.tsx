import { useCallback, useEffect, useState } from 'react'
import type { JavaInstall, JavaRuntimeOption } from '@shared/types'
import { api, errorMessage } from '../api'
import { Icon } from '../components/Icon'
import { useStore } from '../store'

export function Java() {
  const { toast, tasks } = useStore()
  const [runtimes, setRuntimes] = useState<JavaRuntimeOption[] | null>(null)
  const [installs, setInstalls] = useState<JavaInstall[] | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setInstalls(null)
    setError('')
    const [r, i] = await Promise.allSettled([api.java.runtimes(), api.java.detect()])
    if (r.status === 'fulfilled') setRuntimes(r.value)
    else setError(errorMessage(r.reason))
    setInstalls(i.status === 'fulfilled' ? i.value : [])
  }, [])

  useEffect(() => void load(), [load])

  const install = async (component: string) => {
    try {
      await api.java.install(component)
      toast('Java installed', 'success')
      await load()
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Java</h1>
          <p className="muted">
            Minecraft 26.x needs Java 25, 1.20.5–1.21 need Java 21, 1.18–1.20.4 need Java 17 and older versions use Java 8.
            Instances set to “Automatic” download the right one for you.
          </p>
        </div>
        <button className="btn btn-ghost" onClick={() => void load()}>
          <Icon name="refresh" /> Rescan
        </button>
      </div>

      <h2 className="section-title">One-click downloads (Mojang runtimes, Eclipse Temurin where Mojang has none)</h2>
      {error && <div className="error-box">{error}</div>}
      <div className="runtime-grid">
        {runtimes?.map((r) => {
          const busy = tasks[`java:${r.component}`] && !tasks[`java:${r.component}`].finished
          return (
            <article key={r.component} className="card runtime-card">
              <div className="runtime-major">{r.majorVersion}</div>
              <div>
                <strong>Java {r.majorVersion}</strong>
                <span className="muted" title={r.component}>
                  {r.vendor === 'mojang' ? `${r.version} · Mojang` : 'Eclipse Temurin'}
                </span>
              </div>
              {r.installed ? (
                <span className="pill pill-ok">
                  <Icon name="check" size={14} /> Installed
                </span>
              ) : (
                <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => void install(r.component)}>
                  <Icon name="download" size={16} /> {busy ? 'Installing…' : 'Download'}
                </button>
              )}
            </article>
          )
        })}
        {!runtimes && !error && <div className="muted">Loading Mojang runtimes…</div>}
      </div>

      <h2 className="section-title">Java found on this PC</h2>
      <div className="card table">
        {installs?.map((j) => (
          <div key={j.path} className="table-row java-row">
            <strong>Java {j.majorVersion}</strong>
            <span className="muted">
              {j.version} · {j.arch}
            </span>
            <code className="path" title={j.path}>
              {j.path}
            </code>
            <span className="pill">{j.source === 'managed' ? 'Downloaded' : 'System'}</span>
          </div>
        ))}
        {installs?.length === 0 && <div className="muted pad">No Java installations found. Download one above.</div>}
        {!installs && (
          <div className="muted pad">
            <span className="spinner sm" /> Scanning…
          </div>
        )}
      </div>
    </div>
  )
}
