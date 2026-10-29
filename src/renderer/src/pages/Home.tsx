import { useState } from 'react'
import { CreateInstance } from '../components/CreateInstance'
import { Icon } from '../components/Icon'
import { loaderLabel } from '../components/LoaderPicker'
import { api } from '../api'
import { useStore } from '../store'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Late night session'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function Home() {
  const { account, instances, settings, saveSettings, versions, launch, tasks, setPage, setConsoleOpen } = useStore()
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
          <p className="hero-kicker">{greeting()},</p>
          <h1 className="hero-title">{account?.username}</h1>
          <p className="hero-sub">
            {latest ? (
              <>
                Minecraft <strong>{latest.release}</strong> is the latest release
                {latest.snapshot !== latest.release && (
                  <>
                    {' '}· snapshot <strong>{latest.snapshot}</strong> is out
                  </>
                )}
              </>
            ) : (
              'Checking Mojang for the latest versions…'
            )}
          </p>

          <div className="play-bar glass">
            {selected ? (
              <>
                <div className="play-instance">
                  <span className="play-label">Instance</span>
                  <select
                    value={selected.id}
                    onChange={(e) => void saveSettings({ selectedInstanceId: e.target.value })}
                    aria-label="Selected instance"
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
                    <Icon name="stop" size={20} /> Stop
                  </button>
                ) : (
                  <button className="play-btn" disabled={!!launching} onClick={() => void launch(selected.id)}>
                    {launching ? <span className="spinner sm dark" /> : <Icon name="play" size={22} />}
                    {launching ? 'Starting…' : 'Play'}
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="play-instance">
                  <span className="play-label">No instances yet</span>
                  <strong>Create one to start playing</strong>
                </div>
                <button className="play-btn create" disabled={!latest} onClick={() => setCreating(latest?.release ?? '')}>
                  <Icon name="plus" size={22} /> Create
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="home-cards">
        <article className="card news-card release">
          <span className="badge">Latest release</span>
          <h3>{latest?.release ?? '—'}</h3>
          <p className="muted">{releaseDate ? new Date(releaseDate).toLocaleDateString() : ''}</p>
          <button className="btn btn-ghost btn-sm" disabled={!latest} onClick={() => setCreating(latest!.release)}>
            <Icon name="plus" size={16} /> New instance
          </button>
        </article>
        <article className="card news-card snapshot">
          <span className="badge">Latest snapshot</span>
          <h3>{latest?.snapshot ?? '—'}</h3>
          <p className="muted">{snapshotDate ? new Date(snapshotDate).toLocaleDateString() : ''}</p>
          <button className="btn btn-ghost btn-sm" disabled={!latest} onClick={() => setCreating(latest!.snapshot)}>
            <Icon name="plus" size={16} /> Try it
          </button>
        </article>
        <article className="card news-card">
          <span className="badge">Quick actions</span>
          <div className="quick-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setPage('instances')}>
              <Icon name="grid" size={16} /> Instances
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage('java')}>
              <Icon name="coffee" size={16} /> Java
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setConsoleOpen(true)}>
              <Icon name="terminal" size={16} /> Console
            </button>
            {selected && (
              <button className="btn btn-ghost btn-sm" onClick={() => void api.instances.openFolder(selected.id)}>
                <Icon name="folder" size={16} /> Game folder
              </button>
            )}
          </div>
        </article>
      </section>

      {instances.length > 0 && (
        <section>
          <h2 className="section-title">Recently played</h2>
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
                {i.running && <span className="dot-running" title="Running" />}
              </button>
            ))}
          </div>
        </section>
      )}

      {creating !== null && <CreateInstance presetVersion={creating} onClose={() => setCreating(null)} />}
    </div>
  )
}
