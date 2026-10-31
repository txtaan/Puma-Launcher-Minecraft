import { useState } from 'react'
import type { Translate } from '@shared/i18n'
import type { Instance } from '@shared/types'
import { CreateInstance } from '../components/CreateInstance'
import { Icon } from '../components/Icon'
import { InstanceIcon } from '../components/InstanceIcon'
import { loaderLabel } from '../components/LoaderPicker'
import { ModsManager } from '../components/ModsManager'
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

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * "26.3 · Forge": the instance's version and mod loader, leaving out what its name already says, so "Forge 26.3"
 * needs nothing more and "My world" gets both. A loader or version counts only as a whole word ("1.21.1" isn't in
 * "Fabric 1.21.10", "Forge" isn't in "NeoForge").
 */
function details(instance: Pick<Instance, 'name' | 'versionId' | 'loader'>): string {
  const named = (part: string) => new RegExp(`(^|[^\\w.])${escapeRegExp(part)}(?!\\w|\\.\\d)`, 'i').test(instance.name)
  return [instance.versionId, instance.loader && loaderLabel(instance.loader)]
    .filter((part): part is string => !!part && !named(part))
    .join(' · ')
}

export function Home() {
  const { account, instances, settings, saveSettings, versions, launch, tasks, setPage, logs, setConsoleOpen, t, locale } = useStore()
  const [creating, setCreating] = useState<string | null>(null)
  const [modding, setModding] = useState<Instance | null>(null)
  const isLaunching = (id: string) => !!tasks[`launch:${id}`] && !tasks[`launch:${id}`].finished
  const selected = instances.find((i) => i.id === settings?.selectedInstanceId) ?? instances[0]
  const launching = selected && isLaunching(selected.id)
  // Java has started but Minecraft hasn't opened its window yet: no Stop button until it has.
  const opening = selected?.running && !selected.windowOpen
  // The game log is a click away while the game starts and runs, and after it closes (until the next launch clears it).
  const hasLog = selected && (selected.running || launching || logs.some((l) => l.instanceId === selected.id))
  // Instances come most recently played first (new ones count from when they were made), so this is the server
  // the player was on last.
  const joinable = instances.find((i) => i.server)
  const joining = joinable && isLaunching(joinable.id)
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
                <InstanceIcon instance={selected} size={48} />
                <div className="play-instance">
                  <span className="play-label">{t('home.instance')}</span>
                  <select
                    value={selected.id}
                    onChange={(e) => void saveSettings({ selectedInstanceId: e.target.value })}
                    aria-label={t('home.selectedInstance')}
                  >
                    {instances.map((i) => (
                      <option key={i.id} value={i.id}>
                        {details(i) ? `${i.name} — ${details(i)}` : i.name}
                      </option>
                    ))}
                  </select>
                </div>
                {hasLog && (
                  <button className="play-log" aria-label={t('console.title')} title={t('console.title')} onClick={() => setConsoleOpen(true)}>
                    <Icon name="terminal" size={20} />
                  </button>
                )}
                {selected.running && !opening ? (
                  <button className="play-btn running" onClick={() => void api.instances.kill(selected.id)}>
                    <Icon name="stop" size={20} /> {t('common.stop')}
                  </button>
                ) : (
                  <button className="play-btn" disabled={!!launching || opening} onClick={() => void launch(selected.id)}>
                    {launching || opening ? <span className="spinner sm dark" /> : <Icon name="play" size={22} />}
                    {opening ? t('common.opening') : launching ? t('common.starting') : t('common.play')}
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="play-instance">
                  <span className="play-label">{t('home.noInstances')}</span>
                  <strong>{t('home.createToPlay')}</strong>
                </div>
                {/* No preset version, so the dialog starts by asking what the player wants to play */}
                <button className="play-btn create" disabled={!latest} onClick={() => setCreating('')}>
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
        <article className="card news-card quick-card">
          <span className="badge">{t('home.quickActions')}</span>
          <div className="quick-actions">
            {joinable?.server && (
              <button
                className="btn btn-ghost btn-sm quick-join"
                disabled={joining || joinable.running}
                title={t('home.joinTitle', { name: joinable.name, server: joinable.server })}
                onClick={() => void launch(joinable.id)}
              >
                {joining ? <span className="spinner sm" /> : <Icon name="server" size={16} />}
                {/* The port is noise on the button; the tooltip has the whole address */}
                <span>{t('home.join', { server: joinable.server.replace(/:\d*$/, '') })}</span>
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setPage('skins')}>
              <Icon name="shirt" size={16} /> {t('skins.change')}
            </button>
            {/* The selected instance's two side by side. A vanilla instance gets the same mods window, which starts by
                offering a mod loader. */}
            {selected && (
              <button className="btn btn-ghost btn-sm" onClick={() => setModding(selected)}>
                <Icon name="puzzle" size={16} /> {t('instances.addMods')}
              </button>
            )}
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
                <InstanceIcon instance={i} size={40} />
                <div>
                  <strong>{i.name}</strong>
                  {details(i) && <span className="muted">{details(i)}</span>}
                  {/* Like the Join button: the port is noise here, the tooltip has the whole address */}
                  {i.server && (
                    <span className="muted recent-server" title={i.server}>
                      <Icon name="server" size={12} />
                      <span>{i.server.replace(/:\d*$/, '')}</span>
                    </span>
                  )}
                </div>
                {i.running && <span className="dot-running" title={t('home.running')} />}
              </button>
            ))}
          </div>
        </section>
      )}

      {creating !== null && <CreateInstance presetVersion={creating} onClose={() => setCreating(null)} />}
      {modding && <ModsManager instance={modding} startTab="browse" onClose={() => setModding(null)} />}
    </div>
  )
}
