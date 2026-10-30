import { useCallback, useEffect, useState } from 'react'
import type { JavaInstall, JavaRuntimeOption } from '@shared/types'
import { api, errorMessage } from '../api'
import { Icon } from '../components/Icon'
import { useStore } from '../store'

export function Java() {
  const { toast, tasks, t } = useStore()
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
      toast(t('java.installedToast'), 'success')
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
          <p className="muted">{t('java.subtitle')}</p>
        </div>
        <button className="btn btn-ghost" onClick={() => void load()}>
          <Icon name="refresh" /> {t('java.rescan')}
        </button>
      </div>

      <h2 className="section-title">{t('java.oneClick')}</h2>
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
                  <Icon name="check" size={14} /> {t('java.installed')}
                </span>
              ) : (
                <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => void install(r.component)}>
                  <Icon name="download" size={16} /> {busy ? t('java.installing') : t('java.download')}
                </button>
              )}
            </article>
          )
        })}
        {!runtimes && !error && <div className="muted">{t('java.loading')}</div>}
      </div>

      <h2 className="section-title">{t('java.found')}</h2>
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
            <span className="pill">{j.source === 'managed' ? t('java.downloaded') : t('java.system')}</span>
          </div>
        ))}
        {installs?.length === 0 && <div className="muted pad">{t('java.none')}</div>}
        {!installs && (
          <div className="muted pad">
            <span className="spinner sm" /> {t('java.scanning')}
          </div>
        )}
      </div>
    </div>
  )
}
