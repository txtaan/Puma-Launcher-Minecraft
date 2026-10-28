import { useMemo, useState } from 'react'
import type { VersionType } from '@shared/types'
import { api, errorMessage } from '../api'
import { useStore } from '../store'
import { Modal } from './Modal'

const FILTERS: { key: VersionType; label: string }[] = [
  { key: 'release', label: 'Releases' },
  { key: 'snapshot', label: 'Snapshots' },
  { key: 'old_beta', label: 'Beta' },
  { key: 'old_alpha', label: 'Alpha' }
]

export function CreateInstance({ presetVersion, onClose }: { presetVersion?: string; onClose: () => void }) {
  const { versions, refreshInstances, saveSettings, toast } = useStore()
  const preset = versions?.versions.find((v) => v.id === presetVersion)
  const [filter, setFilter] = useState<VersionType>(preset?.type ?? 'release')
  const [versionId, setVersionId] = useState(presetVersion ?? versions?.latest.release ?? '')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const list = useMemo(() => versions?.versions.filter((v) => v.type === filter) ?? [], [versions, filter])

  const create = async () => {
    setBusy(true)
    try {
      const inst = await api.instances.create(name || versionId, versionId)
      await saveSettings({ selectedInstanceId: inst.id })
      await refreshInstances()
      toast(`Created ${inst.name}`, 'success')
      onClose()
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="New instance" onClose={onClose}>
      <div className="stack">
        <label className="field">
          <span>Name</span>
          <input value={name} placeholder={versionId || 'My world'} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field">
          <span>Version</span>
          <div className="segmented">
            {FILTERS.map((f) => (
              <button key={f.key} className={filter === f.key ? 'active' : ''} onClick={() => setFilter(f.key)}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="version-picker">
            {list.map((v) => (
              <button key={v.id} className={`version-option ${versionId === v.id ? 'active' : ''}`} onClick={() => setVersionId(v.id)}>
                <span>{v.id}</span>
                <span className="muted">{new Date(v.releaseTime).toLocaleDateString()}</span>
              </button>
            ))}
            {!list.length && <div className="muted pad">No versions loaded yet.</div>}
          </div>
        </div>
        <div className="row end gap-s">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!versionId || busy} onClick={() => void create()}>
            Create
          </button>
        </div>
      </div>
    </Modal>
  )
}
