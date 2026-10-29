import { useState } from 'react'
import type { Translate } from '@shared/i18n'
import { CreateInstance } from '../components/CreateInstance'
import { Icon } from '../components/Icon'
import { loaderLabel } from '../components/LoaderPicker'
import { api } from '../api'
import { rich } from '../rich'
import { useStore } from '../store'

function greeting(t: Translate): string {
  const h = new Date().getHours()
  if (h < 5) return t('home.lateNight')
  if (h < 12) return t('home.morning')
  if (h < 18) return t('home.afternoon')
  return t('home.evening')
}

export function Home() {
  const { account, instances, settings, saveSettings, versions, launch, tasks, setPage, setConsoleOpen, t, locale } = useStore()
  const [creating, setCreating] = useState<string | null>(null)
  const selected = instances.find((i) => i.id === settings?.selectedInstanceId) ?? instances[0]
  const launching = selected && tasks[`launch:${selected.id}`] && !tasks[`launch:${selected.id}`].finished
  const latest = versions?.latest
  const snapshotDate = versions?.versions.find((v) => v.id === latest?.snapshot)?.releaseTime
  const releaseDate = versions?.versions.find((v) => v.id === latest?.release)?.releaseTime

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-art" aria-hidden />
        <div className="hero-content">
          <p className="hero-kicker">{greeting(t)},</p>
          <h1 className="hero-title">{account?.username}</h1>
          <p className="hero-sub">
            {latest
              ? rich(t(latest.snapshot !== latest.release ? 'home.latestBoth' : 'home.latestRelease'), {
                  release: <strong>{latest.release}</strong>,
                  snapshot: <strong>{latest.snapshot}</strong>
                })
              : t('home.checking')}
          </p>

          <div className="play-bar glass">
            {selected ? (
              <>
                <div className="play-instance">
                  <span className="play-label">{t('home.instance')}</span>
                  <select
                    value={selected.id}
                    onChange={(e) => void saveSettings({ selectedInstanceId: e.target.value })}
                    aria-label={t('home.selectedInstance')}
                  >
                    {instances.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name === i.versionId ? i.name : `${i.name} — ${i.versionId}`}
                        {i.loader ? ` · ${loaderLabel(i.loader)}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                {selected.running ? (
                  <button className="play-btn running" onClick={() => void api.instances.kill(selected.id)}>
                    <Icon name="stop" size={20} /> {t('common.stop')}
                  </button>
                ) : (
                  <button className="play-btn" disabled={!!launching} onClick={() => void launch(selected.id)}>
                    {launching ? <span className="spinner sm dark" /> : <Icon name="play" size={22} />}
                    {launching ? t('common.starting') : t('common.play')}
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="play-instance">
                  <span className="play-label">{t('home.noInstances')}</span>
                  <strong>{t('home.createToPlay')}</strong>
                </div>
                <button className="play-btn create" disabled={!latest} onClick={() => setCreating(latest?.release ?? '')}>
                  <Icon name="plus" size={22} /> {t('common.create')}
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="home-cards">
        <article className="card news-card release">
          <span className="badge">{t('home.latestReleaseCard')}</span>
          <h3>{latest?.release ?? '—'}</h3>
          <p className="muted">{releaseDate ? new Date(releaseDate).toLocaleDateString(locale) : ''}</p>
          <button className="btn btn-ghost btn-sm" disabled={!latest} onClick={() => setCreating(latest!.release)}>
            <Icon name="plus" size={16} /> {t('common.newInstance')}
          </button>
        </article>
        <article className="card news-card snapshot">
          <span className="badge">{t('home.latestSnapshotCard')}</span>
          <h3>{latest?.snapshot ?? '—'}</h3>
          <p className="muted">{snapshotDate ? new Date(snapshotDate).toLocaleDateString(locale) : ''}</p>
          <button className="btn btn-ghost btn-sm" disabled={!latest} onClick={() => setCreating(latest!.snapshot)}>
            <Icon name="plus" size={16} /> {t('home.tryIt')}
          </button>
        </article>
        <article className="card news-card">
          <span className="badge">{t('home.quickActions')}</span>
          <div className="quick-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setPage('instances')}>
              <Icon name="grid" size={16} /> {t('nav.instances')}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage('java')}>
              <Icon name="coffee" size={16} /> {t('nav.java')}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setConsoleOpen(true)}>
              <Icon name="terminal" size={16} /> {t('nav.console')}
            </button>
            {selected && (
              <button className="btn btn-ghost btn-sm" onClick={() => void api.instances.openFolder(selected.id)}>
                <Icon name="folder" size={16} /> {t('home.gameFolder')}
              </button>
            )}
          </div>
        </article>
      </section>

      {instances.length > 0 && (
        <section>
          <h2 className="section-title">{t('home.recent')}</h2>
          <div className="recent-row">
            {instances.slice(0, 4).map((i) => (
              <button key={i.id} className="card recent" onClick={() => void saveSettings({ selectedInstanceId: i.id })}>
                <span className="recent-icon">{i.name[0]?.toUpperCase()}</span>
                <div>
                  <strong>{i.name}</strong>
                  <span className="muted">
                    {i.versionId}
                    {i.loader ? ` · ${loaderLabel(i.loader)}` : ''}
                  </span>
                </div>
                {i.running && <span className="dot-running" title={t('home.running')} />}
              </button>
            ))}
          </div>
        </section>
      )}

      {creating !== null && <CreateInstance presetVersion={creating} onClose={() => setCreating(null)} />}
    </div>
  )
}
