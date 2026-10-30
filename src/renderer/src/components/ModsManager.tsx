import { useCallback, useEffect, useState } from 'react'
import type { InstalledMod, Instance, ModSearchHit } from '@shared/types'
import { api, errorMessage } from '../api'
import { modIcon } from '../modIcons'
import { useStore } from '../store'
import { Icon } from './Icon'
import { loaderLabel } from './LoaderPicker'
import { Modal } from './Modal'

function compact(n: number, locale: string | undefined): string {
  return Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

/** Installed mods + Modrinth browser for one instance (Prism/HMCL-style mod management). */
export function ModsManager({ instance, onClose }: { instance: Instance; onClose: () => void }) {
  const { toast, t } = useStore()
  const [tab, setTab] = useState<'installed' | 'browse'>('installed')
  const [mods, setMods] = useState<InstalledMod[] | null>(null)

  const refresh = useCallback(async () => {
    try {
      setMods(await api.mods.list(instance.id))
    } catch (err) {
      toast(errorMessage(err), 'error')
      setMods([])
    }
  }, [instance.id, toast])

  useEffect(() => void refresh(), [refresh])

  return (
    <Modal title={t('mods.title', { name: instance.name })} onClose={onClose} wide>
      <div className="row gap-s mods-head">
        <div className="segmented">
          <button className={tab === 'installed' ? 'active' : ''} onClick={() => setTab('installed')}>
            {t('mods.installedTab')}
            {mods ? ` (${mods.length})` : ''}
          </button>
          <button className={tab === 'browse' ? 'active' : ''} onClick={() => setTab('browse')}>
            {t('mods.browse')}
          </button>
        </div>
        <span className="pill">
          {loaderLabel(instance.loader)} · {instance.versionId}
        </span>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => void api.mods.openFolder(instance.id)}>
          <Icon name="folder" size={16} /> {t('mods.folder')}
        </button>
      </div>

      {!instance.loader ? (
        <div className="empty">
          <Icon name="layers" size={28} />
          <p>{t('mods.vanilla')}</p>
        </div>
      ) : tab === 'installed' ? (
        <InstalledList instance={instance} mods={mods} refresh={refresh} onBrowse={() => setTab('browse')} />
      ) : (
        <Browse instance={instance} onInstalled={refresh} />
      )}
    </Modal>
  )
}

function InstalledList({
  instance,
  mods,
  refresh,
  onBrowse
}: {
  instance: Instance
  mods: InstalledMod[] | null
  refresh: () => Promise<void>
  onBrowse: () => void
}) {
  const { toast, t } = useStore()
  if (!mods) return <div className="muted pad"><span className="spinner sm" /> {t('mods.reading')}</div>
  if (!mods.length) {
    return (
      <div className="empty">
        <p>{t('mods.none')}</p>
        <button className="btn btn-primary btn-sm" onClick={onBrowse}>
          {t('mods.browse')}
        </button>
      </div>
    )
  }
  const act = async (fn: () => Promise<void>) => {
    try {
      await fn()
      await refresh()
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }
  return (
    <div className="mod-list">
      {mods.map((m) => (
        <div key={m.fileName} className={`mod-row ${m.enabled ? '' : 'disabled'}`}>
          <label className="toggle compact" title={m.enabled ? t('mods.disable') : t('mods.enable')}>
            <input type="checkbox" checked={m.enabled} onChange={(e) => void act(() => api.mods.setEnabled(instance.id, m.fileName, e.target.checked))} />
            <span className="toggle-track">
              <span className="toggle-thumb" />
            </span>
          </label>
          <div className="grow">
            <strong>{m.name}</strong>
            <div className="muted small">
              {m.version ? `${m.version} · ` : ''}
              {m.fileName}
            </div>
          </div>
          <button
            className="icon-btn danger"
            aria-label={t('mods.delete', { name: m.name })}
            onClick={() => void act(() => api.mods.remove(instance.id, m.fileName))}
          >
            <Icon name="trash" size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}

function Browse({ instance, onInstalled }: { instance: Instance; onInstalled: () => Promise<void> }) {
  const { toast, t, locale } = useStore()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ModSearchHit[] | null>(null)
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState<Record<string, boolean>>({})

  const search = useCallback(
    async (q: string, offset = 0) => {
      try {
        const res = await api.mods.search(instance.id, q, offset)
        setHits((prev) => (offset && prev ? [...prev, ...res.hits] : res.hits))
        setTotal(res.total)
      } catch (err) {
        toast(errorMessage(err), 'error')
        setHits([])
      }
    },
    [instance.id, toast]
  )

  useEffect(() => {
    const timer = setTimeout(() => void search(query), query ? 350 : 0)
    return () => clearTimeout(timer)
  }, [query, search])

  const saveJar = async (hit: ModSearchHit) => {
    try {
      const file = await api.mods.saveJar(hit.projectId)
      if (file) toast(t('mods.savedJar', { file }), 'success')
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const install = async (hit: ModSearchHit) => {
    setBusy((b) => ({ ...b, [hit.projectId]: true }))
    try {
      const files = await api.mods.install(instance.id, hit.projectId)
      const deps = files.length - 1
      toast(
        deps > 1
          ? t('mods.installedWithDeps', { title: hit.title, count: deps })
          : t(deps === 1 ? 'mods.installedWithDep' : 'mods.installedOne', { title: hit.title }),
        'success'
      )
      setHits((h) => h?.map((x) => (x.projectId === hit.projectId ? { ...x, installed: true } : x)) ?? null)
      await onInstalled()
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy((b) => ({ ...b, [hit.projectId]: false }))
    }
  }

  return (
    <div className="stack">
      <label className="search">
        <Icon name="search" size={16} />
        <input autoFocus placeholder={t('mods.search', { loader: loaderLabel(instance.loader), version: instance.versionId })} value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="mod-list browse">
        {!hits && <div className="muted pad"><span className="spinner sm" /> {t('mods.searching')}</div>}
        {hits?.length === 0 && <div className="muted pad">{t('mods.noneFound')}</div>}
        {hits?.map((h) => {
          const icon = modIcon(h.projectId, h.iconUrl)
          return (
            <div key={h.projectId} className={`mod-row ${h.featured ? 'featured' : ''}`}>
              {icon ? <img className="mod-icon" src={icon} alt="" loading="lazy" /> : <span className="mod-icon">{h.title[0]}</span>}
              <div className="grow">
                <div className="row gap-s">
                  <strong>{h.title}</strong>
                  {h.featured ? (
                    <span className="pill">{t('mods.byPuma')}</span>
                  ) : (
                    <span className="muted small">{t('mods.by', { author: h.author })}</span>
                  )}
                </div>
                <div className="muted small clamp">{h.description}</div>
                {h.featured ? (
                  <div className="muted small">{t('mods.serverHint')}</div>
                ) : (
                  <div className="muted small">
                    <Icon name="download" size={12} /> {compact(h.downloads, locale)}
                  </div>
                )}
              </div>
              {h.featured && (
                <button className="btn btn-ghost btn-sm" title={t('mods.saveJarTitle')} onClick={() => void saveJar(h)}>
                  <Icon name="download" size={14} /> {t('mods.saveJar')}
                </button>
              )}
              <button
                className={`btn btn-sm ${h.installed ? 'btn-ghost' : 'btn-primary'}`}
                disabled={busy[h.projectId]}
                onClick={() => void install(h)}
              >
                {busy[h.projectId] ? t('mods.installing') : h.installed ? t('mods.update') : t('mods.install')}
              </button>
            </div>
          )
        })}
        {hits && hits.length < total && (
          <button className="btn btn-ghost btn-sm w-full" onClick={() => void search(query, hits.length)}>
            {t('mods.loadMore')}
          </button>
        )}
      </div>
      <p className="hint">{t('mods.hint')}</p>
    </div>
  )
}
