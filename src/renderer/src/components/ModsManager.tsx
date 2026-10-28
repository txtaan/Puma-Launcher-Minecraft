import { useCallback, useEffect, useState } from 'react'
import type { InstalledMod, Instance, ModSearchHit } from '@shared/types'
import { api, errorMessage } from '../api'
import { useStore } from '../store'
import { Icon } from './Icon'
import { loaderLabel } from './LoaderPicker'
import { Modal } from './Modal'

function compact(n: number): string {
  return Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

/** Installed mods + Modrinth browser for one instance (Prism/HMCL-style mod management). */
export function ModsManager({ instance, onClose }: { instance: Instance; onClose: () => void }) {
  const { toast } = useStore()
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
    <Modal title={`Mods · ${instance.name}`} onClose={onClose} wide>
      <div className="row gap-s mods-head">
        <div className="segmented">
          <button className={tab === 'installed' ? 'active' : ''} onClick={() => setTab('installed')}>
            Installed{mods ? ` (${mods.length})` : ''}
          </button>
          <button className={tab === 'browse' ? 'active' : ''} onClick={() => setTab('browse')}>
            Browse Modrinth
          </button>
        </div>
        <span className="pill">
          {loaderLabel(instance.loader)} · {instance.versionId}
        </span>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => void api.mods.openFolder(instance.id)}>
          <Icon name="folder" size={16} /> Mods folder
        </button>
      </div>

      {!instance.loader ? (
        <div className="empty">
          <Icon name="layers" size={28} />
          <p>This is a vanilla instance. Pick Fabric, Quilt, Forge or NeoForge in the instance settings to use mods.</p>
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
  const { toast } = useStore()
  if (!mods) return <div className="muted pad"><span className="spinner sm" /> Reading mods…</div>
  if (!mods.length) {
    return (
      <div className="empty">
        <p>No mods installed yet.</p>
        <button className="btn btn-primary btn-sm" onClick={onBrowse}>
          Browse Modrinth
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
          <label className="toggle compact" title={m.enabled ? 'Disable' : 'Enable'}>
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
            aria-label={`Delete ${m.name}`}
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
  const { toast } = useStore()
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
    const t = setTimeout(() => void search(query), query ? 350 : 0)
    return () => clearTimeout(t)
  }, [query, search])

  const install = async (hit: ModSearchHit) => {
    setBusy((b) => ({ ...b, [hit.projectId]: true }))
    try {
      const files = await api.mods.install(instance.id, hit.projectId)
      toast(files.length > 1 ? `Installed ${hit.title} and ${files.length - 1} required mod(s)` : `Installed ${hit.title}`, 'success')
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
        <input autoFocus placeholder={`Search ${loaderLabel(instance.loader)} mods for ${instance.versionId}`} value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="mod-list browse">
        {!hits && <div className="muted pad"><span className="spinner sm" /> Searching Modrinth…</div>}
        {hits?.length === 0 && <div className="muted pad">No compatible mods found.</div>}
        {hits?.map((h) => (
          <div key={h.projectId} className="mod-row">
            {h.iconUrl ? <img className="mod-icon" src={h.iconUrl} alt="" loading="lazy" /> : <span className="mod-icon">{h.title[0]}</span>}
            <div className="grow">
              <div className="row gap-s">
                <strong>{h.title}</strong>
                <span className="muted small">by {h.author}</span>
              </div>
              <div className="muted small clamp">{h.description}</div>
              <div className="muted small">
                <Icon name="download" size={12} /> {compact(h.downloads)}
              </div>
            </div>
            <button
              className={`btn btn-sm ${h.installed ? 'btn-ghost' : 'btn-primary'}`}
              disabled={busy[h.projectId]}
              onClick={() => void install(h)}
            >
              {busy[h.projectId] ? 'Installing…' : h.installed ? 'Update' : 'Install'}
            </button>
          </div>
        ))}
        {hits && hits.length < total && (
          <button className="btn btn-ghost btn-sm w-full" onClick={() => void search(query, hits.length)}>
            Load more
          </button>
        )}
      </div>
      <p className="hint">Mods and their required dependencies are downloaded from Modrinth and verified by SHA-1.</p>
    </div>
  )
}
