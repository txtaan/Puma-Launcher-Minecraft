import { useEffect, useState } from 'react'
import type { Instance, JavaInstall } from '@shared/types'
import { api, errorMessage } from '../api'
import { CreateInstance } from '../components/CreateInstance'
import { Icon } from '../components/Icon'
import { LoaderPicker, loaderLabel } from '../components/LoaderPicker'
import { Modal } from '../components/Modal'
import { ModsManager } from '../components/ModsManager'
import { useStore } from '../store'

export function Instances() {
  const { instances, launch, tasks, refreshInstances, toast, saveSettings, settings } = useStore()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Instance | null>(null)
  const [modding, setModding] = useState<Instance | null>(null)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Instances</h1>
          <p className="muted">Each instance has its own worlds, mods, resource packs and Java settings.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Icon name="plus" /> New instance
        </button>
      </div>

      {instances.length === 0 && (
        <div className="empty card">
          <Icon name="grid" size={32} />
          <p>No instances yet.</p>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            Create your first instance
          </button>
        </div>
      )}

      <div className="instance-grid">
        {instances.map((i) => {
          const launching = tasks[`launch:${i.id}`] && !tasks[`launch:${i.id}`].finished
          return (
            <article key={i.id} className={`card instance-card ${settings?.selectedInstanceId === i.id ? 'selected' : ''}`}>
              <button className="instance-cover" onClick={() => void saveSettings({ selectedInstanceId: i.id })}>
                <span>{i.name[0]?.toUpperCase()}</span>
              </button>
              <div className="instance-info">
                <strong title={i.name}>{i.name}</strong>
                <span className="muted">
                  {i.versionId} · {loaderLabel(i.loader)}
                  {i.lastPlayed ? ` · played ${new Date(i.lastPlayed).toLocaleDateString()}` : ''}
                </span>
              </div>
              <div className="instance-actions">
                {i.running ? (
                  <button className="btn btn-danger btn-sm" onClick={() => void api.instances.kill(i.id)}>
                    <Icon name="stop" size={14} /> Stop
                  </button>
                ) : (
                  <button className="btn btn-primary btn-sm" disabled={!!launching} onClick={() => void launch(i.id)}>
                    <Icon name="play" size={14} /> {launching ? 'Starting…' : 'Play'}
                  </button>
                )}
                <button className="icon-btn" title="Mods" aria-label="Mods" onClick={() => setModding(i)}>
                  <Icon name="puzzle" size={16} />
                </button>
                <button className="icon-btn" title="Settings" aria-label="Instance settings" onClick={() => setEditing(i)}>
                  <Icon name="sliders" size={16} />
                </button>
                <button className="icon-btn" title="Open folder" aria-label="Open folder" onClick={() => void api.instances.openFolder(i.id)}>
                  <Icon name="folder" size={16} />
                </button>
                <button
                  className="icon-btn danger"
                  title="Delete"
                  aria-label="Delete instance"
                  onClick={async () => {
                    if (!confirm(`Delete "${i.name}" and all its worlds? This cannot be undone.`)) return
                    try {
                      await api.instances.remove(i.id)
                      await refreshInstances()
                    } catch (err) {
                      toast(errorMessage(err), 'error')
                    }
                  }}
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            </article>
          )
        })}
      </div>

      {creating && <CreateInstance onClose={() => setCreating(false)} />}
      {editing && <EditInstance instance={editing} onClose={() => setEditing(null)} />}
      {modding && <ModsManager instance={modding} onClose={() => setModding(null)} />}
    </div>
  )
}

function EditInstance({ instance, onClose }: { instance: Instance; onClose: () => void }) {
  const { refreshInstances, toast, settings, versions } = useStore()
  const [draft, setDraft] = useState<Instance>(instance)
  const [javas, setJavas] = useState<JavaInstall[] | null>(null)
  const [loaderReady, setLoaderReady] = useState(true)

  useEffect(() => {
    void api.java.detect().then(setJavas)
  }, [])

  const set = <K extends keyof Instance>(k: K, v: Instance[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const num = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Number(v) || 0))

  const save = async () => {
    try {
      await api.instances.update(instance.id, { ...draft, loader: draft.loader })
      await refreshInstances()
      onClose()
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const custom = draft.javaPath && !javas?.some((j) => j.path === draft.javaPath)

  return (
    <Modal title={`Edit ${instance.name}`} onClose={onClose} wide>
      <div className="form-grid">
        <label className="field">
          <span>Name</span>
          <input value={draft.name} onChange={(e) => set('name', e.target.value)} />
        </label>
        <label className="field">
          <span>Minecraft version</span>
          <select value={draft.versionId} onChange={(e) => set('versionId', e.target.value)}>
            {!versions?.versions.some((v) => v.id === draft.versionId) && <option value={draft.versionId}>{draft.versionId}</option>}
            {versions?.versions
              .filter((v) => v.type === 'release' || v.type === 'snapshot')
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.id} {v.type === 'snapshot' ? '(snapshot)' : ''}
                </option>
              ))}
          </select>
        </label>
        <div className="span-2">
          <LoaderPicker
            mcVersion={draft.versionId}
            value={draft.loader}
            onChange={(l, ready) => {
              setDraft((d) => ({ ...d, loader: l }))
              setLoaderReady(ready)
            }}
          />
        </div>
        <label className="field span-2">
          <span>Java runtime</span>
          <select value={custom ? '__custom' : draft.javaPath ?? ''} onChange={(e) => set('javaPath', e.target.value === '__custom' ? draft.javaPath || ' ' : e.target.value || undefined)}>
            <option value="">Automatic (recommended) — the launcher downloads the Java this version needs</option>
            {javas?.map((j) => (
              <option key={j.path} value={j.path}>
                Java {j.version} · {j.arch} · {j.source === 'managed' ? 'downloaded' : 'installed on PC'} — {j.path}
              </option>
            ))}
            <option value="__custom">Custom path…</option>
          </select>
          {!javas && <small className="muted">Scanning for Java installations…</small>}
        </label>
        {custom && (
          <label className="field span-2">
            <span>Custom Java executable</span>
            <input value={draft.javaPath?.trim() ?? ''} placeholder="/path/to/bin/java" onChange={(e) => set('javaPath', e.target.value || undefined)} />
          </label>
        )}
        <label className="field">
          <span>Min memory (MB)</span>
          <input type="number" placeholder={String(settings?.defaultMinMemoryMb)} value={draft.minMemoryMb ?? ''} onChange={(e) => set('minMemoryMb', num(e.target.value))} />
        </label>
        <label className="field">
          <span>Max memory (MB)</span>
          <input type="number" placeholder={String(settings?.defaultMaxMemoryMb)} value={draft.maxMemoryMb ?? ''} onChange={(e) => set('maxMemoryMb', num(e.target.value))} />
        </label>
        <label className="field">
          <span>Window width</span>
          <input type="number" placeholder="854" value={draft.width ?? ''} onChange={(e) => set('width', num(e.target.value))} />
        </label>
        <label className="field">
          <span>Window height</span>
          <input type="number" placeholder="480" value={draft.height ?? ''} onChange={(e) => set('height', num(e.target.value))} />
        </label>
        <label className="field span-2">
          <span>Extra JVM arguments</span>
          <input value={draft.jvmArgs ?? ''} placeholder="-XX:+UseG1GC" onChange={(e) => set('jvmArgs', e.target.value)} />
        </label>
      </div>
      <div className="row end gap-s">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={!loaderReady} onClick={() => void save()}>
          Save
        </button>
      </div>
    </Modal>
  )
}
