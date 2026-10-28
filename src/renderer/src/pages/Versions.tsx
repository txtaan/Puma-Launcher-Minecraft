import { useMemo, useState } from 'react'
import type { VersionType } from '@shared/types'
import { CreateInstance } from '../components/CreateInstance'
import { Icon } from '../components/Icon'
import { useStore } from '../store'

const TABS: { key: VersionType | 'all'; label: string }[] = [
  { key: 'release', label: 'Releases' },
  { key: 'snapshot', label: 'Snapshots' },
  { key: 'old_beta', label: 'Beta' },
  { key: 'old_alpha', label: 'Alpha' },
  { key: 'all', label: 'All' }
]

export function Versions() {
  const { versions, refreshVersions } = useStore()
  const [tab, setTab] = useState<VersionType | 'all'>('release')
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const list = useMemo(
    () =>
      (versions?.versions ?? []).filter(
        (v) => (tab === 'all' || v.type === tab) && v.id.toLowerCase().includes(query.toLowerCase())
      ),
    [versions, tab, query]
  )

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Versions</h1>
          <p className="muted">
            Straight from Mojang — new releases and snapshots appear automatically.
            {versions?.fetchedAt ? ` Last checked ${new Date(versions.fetchedAt).toLocaleTimeString()}.` : versions ? ' Showing cached list (offline).' : ''}
          </p>
        </div>
        <button
          className="btn btn-ghost"
          disabled={refreshing}
          onClick={async () => {
            setRefreshing(true)
            await refreshVersions(true)
            setRefreshing(false)
          }}
        >
          <Icon name="refresh" className={refreshing ? 'spin' : ''} /> Refresh
        </button>
      </div>

      <div className="toolbar">
        <div className="segmented">
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <label className="search">
          <Icon name="search" size={16} />
          <input placeholder="Search versions" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      <div className="card table">
        {list.map((v) => (
          <div key={v.id} className="table-row">
            <div className="version-id">
              <strong>{v.id}</strong>
              {v.id === versions?.latest.release && <span className="pill pill-accent">Latest</span>}
              {v.id === versions?.latest.snapshot && v.type === 'snapshot' && <span className="pill pill-accent">Latest snapshot</span>}
              {v.installed && <span className="pill">Installed</span>}
            </div>
            <span className="muted capitalize">{v.type.replace('old_', '')}</span>
            <span className="muted">{new Date(v.releaseTime).toLocaleDateString()}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setCreating(v.id)}>
              <Icon name="plus" size={16} /> Create instance
            </button>
          </div>
        ))}
        {!list.length && <div className="muted pad">{versions ? 'No versions match your search.' : 'Loading versions…'}</div>}
      </div>

      {creating && <CreateInstance presetVersion={creating} onClose={() => setCreating(null)} />}
    </div>
  )
}
