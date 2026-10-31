import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import type { Instance, JavaInstall } from '@shared/types'
import { api, errorMessage } from '../api'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { CreateInstance } from '../components/CreateInstance'
import { Icon } from '../components/Icon'
import { defaultIcon, IconPicker, iconTint, InstanceIcon, instanceIcon } from '../components/InstanceIcon'
import { LoaderPicker, loaderLabel } from '../components/LoaderPicker'
import { MemorySlider } from '../components/MemorySlider'
import { MenuButton } from '../components/Menu'
import { Modal } from '../components/Modal'
import { ModsManager } from '../components/ModsManager'
import { ServerField } from '../components/ServerField'
import { Toggle } from '../components/Toggle'
import { serverAddressError } from '../serverAddress'
import { useStore } from '../store'

export function Instances() {
  const { instances, launch, tasks, refreshInstances, toast, saveSettings, settings, setConsoleOpen, t, locale } = useStore()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Instance | null>(null)
  const [modding, setModding] = useState<Instance | null>(null)
  const [deleting, setDeleting] = useState<Instance | null>(null)

  const remove = async (instance: Instance) => {
    try {
      await api.instances.remove(instance.id)
      await refreshInstances()
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('nav.instances')}</h1>
          <p className="muted">{t('instances.subtitle')}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Icon name="plus" /> {t('common.newInstance')}
        </button>
      </div>

      {instances.length === 0 && (
        <div className="empty card">
          <Icon name="grid" size={32} />
          <p>{t('instances.empty')}</p>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            {t('instances.createFirst')}
          </button>
        </div>
      )}

      <div className="instance-grid">
        {instances.map((i) => {
          const launching = tasks[`launch:${i.id}`] && !tasks[`launch:${i.id}`].finished
          const opening = i.running && !i.windowOpen
          const selected = settings?.selectedInstanceId === i.id
          const meta = [
            `${i.versionId} · ${loaderLabel(i.loader)}`,
            i.modCount === undefined
              ? ''
              : i.modCount === 0
                ? t('instances.modsNone')
                : i.modCount === 1
                  ? t('instances.modsOne')
                  : t('instances.modsMany', { count: i.modCount }),
            i.lastPlayed ? t('instances.played', { date: new Date(i.lastPlayed).toLocaleDateString(locale) }) : ''
          ].filter(Boolean)
          return (
            <article key={i.id} className={`card instance-card ${selected ? 'selected' : ''}`}>
              <button
                className="instance-cover"
                style={{ '--tint': iconTint(instanceIcon(i)) } as CSSProperties}
                aria-label={t('instances.select', { name: i.name })}
                aria-pressed={selected}
                onClick={() => void saveSettings({ selectedInstanceId: i.id })}
              >
                <InstanceIcon instance={i} size={64} bare />
              </button>
              <div className="instance-info">
                <strong title={i.name}>{i.name}</strong>
                {/* Each part stays on one line; a long line wraps between parts */}
                <span className="instance-meta muted">
                  {meta.map((part, n) => (
                    <span key={n}>
                      {n > 0 && ' · '}
                      <span className="nowrap">{part}</span>
                    </span>
                  ))}
                </span>
                {i.server && (
                  <span className="instance-server muted" title={t('instances.server')}>
                    <Icon name="server" size={13} />
                    <span>{i.server}</span>
                  </span>
                )}
              </div>
              <div className="instance-actions">
                {i.running && !opening ? (
                  <button className="btn btn-danger btn-sm" onClick={() => void api.instances.kill(i.id)}>
                    <Icon name="stop" size={14} /> <span>{t('common.stop')}</span>
                  </button>
                ) : (
                  <button className="btn btn-primary btn-sm" disabled={!!launching || opening} onClick={() => void launch(i.id)}>
                    <Icon name="play" size={14} /> <span>{opening ? t('common.opening') : launching ? t('common.starting') : t('common.play')}</span>
                  </button>
                )}
                <div className="instance-more">
                  {/* A vanilla instance gets the same window, which starts by offering a mod loader */}
                  <button className="btn btn-ghost btn-sm" onClick={() => setModding(i)}>
                    {i.loader ? t('instances.mods') : t('instances.addMods')}
                  </button>
                  {/* Just the gear in a narrow card (see .instance-settings in app.css) */}
                  <button
                    className="btn btn-ghost btn-sm instance-settings"
                    aria-label={t('instances.settings')}
                    title={t('instances.settings')}
                    onClick={() => setEditing(i)}
                  >
                    <Icon name="settings" size={16} />
                    <span>{t('instances.settings')}</span>
                  </button>
                  <MenuButton
                    label={t('instances.more')}
                    items={[
                      { label: t('instances.openFolder'), icon: 'folder', onSelect: () => void api.instances.openFolder(i.id) },
                      { label: t('console.title'), icon: 'terminal', onSelect: () => setConsoleOpen(true) },
                      { label: t('instances.deleteMenu'), icon: 'trash', danger: true, onSelect: () => setDeleting(i) }
                    ]}
                  />
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {creating && <CreateInstance onClose={() => setCreating(false)} />}
      {editing && <EditInstance instance={editing} onClose={() => setEditing(null)} />}
      {modding && <ModsManager instance={modding} onClose={() => setModding(null)} />}
      {deleting && (
        <ConfirmDialog
          title={t('instances.deleteTitle', { name: deleting.name })}
          text={t('instances.deleteText')}
          confirm={t('common.delete')}
          danger
          onClose={() => setDeleting(null)}
          onConfirm={() => void remove(deleting)}
        />
      )}
    </div>
  )
}

function EditInstance({ instance, onClose }: { instance: Instance; onClose: () => void }) {
  const { refreshInstances, toast, settings, versions, t, locale } = useStore()
  const [draft, setDraft] = useState<Instance>(instance)
  const memoryLabel = useId()
  const [javas, setJavas] = useState<JavaInstall[] | null>(null)
  const [loaderReady, setLoaderReady] = useState(true)
  const [serverTried, setServerTried] = useState(false)
  const serverInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void api.java.detect().then(setJavas)
  }, [])

  const set = <K extends keyof Instance>(k: K, v: Instance[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const num = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Number(v) || 0))

  const save = async () => {
    if (serverAddressError(draft.server ?? '')) {
      setServerTried(true)
      serverInput.current?.focus()
      return
    }
    try {
      // An emptied server field is sent as '', which clears the stored server.
      await api.instances.update(instance.id, { ...draft, loader: draft.loader, server: draft.server?.trim() ?? '' })
      await refreshInstances()
      onClose()
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const custom = draft.javaPath && !javas?.some((j) => j.path === draft.javaPath)
  // An instance without memory of its own uses the memory chosen in Settings.
  const defaultMemoryMb = settings?.defaultMaxMemoryMb ?? 4096
  const ownMemory = draft.maxMemoryMb !== undefined
  const defaultMemory = t('memory.gb', { gb: (defaultMemoryMb / 1024).toLocaleString(locale, { maximumFractionDigits: 1 }) })

  return (
    <Modal title={t('instances.settingsTitle', { name: instance.name })} onClose={onClose} wide>
      <div className="form-grid">
        <label className="field">
          <span>{t('common.name')}</span>
          <input value={draft.name} onChange={(e) => set('name', e.target.value)} />
        </label>
        <label className="field">
          <span>{t('instances.mcVersion')}</span>
          <select value={draft.versionId} onChange={(e) => set('versionId', e.target.value)}>
            {!versions?.versions.some((v) => v.id === draft.versionId) && <option value={draft.versionId}>{draft.versionId}</option>}
            {versions?.versions
              .filter((v) => v.type === 'release' || v.type === 'snapshot')
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.id} {v.type === 'snapshot' ? `(${t('type.snapshot').toLowerCase()})` : ''}
                </option>
              ))}
          </select>
        </label>
        <div className="span-2">
          <IconPicker value={draft.icon} fallback={defaultIcon(draft)} onChange={(icon) => set('icon', icon)} />
        </div>
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
        <div className="span-2">
          <ServerField
            ref={serverInput}
            label={t('instances.server')}
            value={draft.server ?? ''}
            onChange={(v) => set('server', v)}
            showError={serverTried}
            help={t('instances.serverHelp')}
          />
        </div>
        <label className="field span-2">
          <span>{t('instances.javaRuntime')}</span>
          <select value={custom ? '__custom' : draft.javaPath ?? ''} onChange={(e) => set('javaPath', e.target.value === '__custom' ? draft.javaPath || ' ' : e.target.value || undefined)}>
            <option value="">{t('instances.javaAuto')}</option>
            {javas?.map((j) => (
              <option key={j.path} value={j.path}>
                Java {j.version} · {j.arch} · {j.source === 'managed' ? t('instances.javaDownloaded') : t('instances.javaOnPc')} — {j.path}
              </option>
            ))}
            <option value="__custom">{t('instances.customPath')}</option>
          </select>
          {!javas && <small className="muted">{t('instances.scanningJava')}</small>}
        </label>
        {custom && (
          <label className="field span-2">
            <span>{t('instances.customJava')}</span>
            <input value={draft.javaPath?.trim() ?? ''} placeholder="/path/to/bin/java" onChange={(e) => set('javaPath', e.target.value || undefined)} />
          </label>
        )}
        <div className="field span-2">
          <span id={memoryLabel}>{t('memory.label')}</span>
          <Toggle
            label={t('memory.useDefault', { gb: defaultMemory })}
            checked={!ownMemory}
            onChange={(useDefault) => setDraft((d) => ({ ...d, maxMemoryMb: useDefault ? undefined : defaultMemoryMb, minMemoryMb: undefined }))}
          />
          {ownMemory && (
            <MemorySlider
              labelId={memoryLabel}
              valueMb={draft.maxMemoryMb ?? defaultMemoryMb}
              onChange={(mb) => setDraft((d) => ({ ...d, maxMemoryMb: mb, minMemoryMb: undefined }))}
            />
          )}
        </div>
        <label className="field">
          <span>{t('instances.width')}</span>
          <input type="number" placeholder="854" value={draft.width ?? ''} onChange={(e) => set('width', num(e.target.value))} />
        </label>
        <label className="field">
          <span>{t('instances.height')}</span>
          <input type="number" placeholder="480" value={draft.height ?? ''} onChange={(e) => set('height', num(e.target.value))} />
        </label>
        <label className="field span-2">
          <span>{t('instances.jvmArgs')}</span>
          <input value={draft.jvmArgs ?? ''} placeholder="-XX:+UseG1GC" onChange={(e) => set('jvmArgs', e.target.value)} />
        </label>
      </div>
      <div className="row end gap-s">
        <button className="btn btn-ghost" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button className="btn btn-primary" disabled={!loaderReady} onClick={() => void save()}>
          {t('common.save')}
        </button>
      </div>
    </Modal>
  )
}
