import { useMemo, useState } from 'react'
import type { MessageKey } from '@shared/i18n'
import type { VersionType } from '@shared/types'
import { CreateInstance } from '../components/CreateInstance'
import { Icon } from '../components/Icon'
import { useStore } from '../store'

const TABS: { key: VersionType | 'all'; label: MessageKey }[] = [
  { key: 'release', label: 'type.releases' },
  { key: 'snapshot', label: 'type.snapshots' },
  { key: 'old_beta', label: 'type.old_beta' },
  { key: 'old_alpha', label: 'type.old_alpha' },
  { key: 'all', label: 'type.all' }
]

export function Versions() {
  const { versions, refreshVersions, t, locale } = useStore()
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
          <h1>{t('nav.versions')}</h1>
          <p className="muted">
            {t('versions.subtitle')}
            {versions?.fetchedAt
              ? ` ${t('versions.lastChecked', { time: new Date(versions.fetchedAt).toLocaleTimeString(locale) })}`
              : versions
                ? ` ${t('versions.cached')}`
                : ''}
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
          <Icon name="refresh" className={refreshing ? 'spin' : ''} /> {t('common.refresh')}
        </button>
      </div>

      <div className="toolbar">
        <div className="segmented">
          {TABS.map((tb) => (
            <button key={tb.key} className={tab === tb.key ? 'active' : ''} onClick={() => setTab(tb.key)}>
              {t(tb.label)}
            </button>
          ))}
        </div>
        <label className="search">
          <Icon name="search" size={16} />
          <input placeholder={t('versions.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      <div className="card table">
        {list.map((v) => (
          <div key={v.id} className="table-row">
            <div className="version-id">
              <strong>{v.id}</strong>
              {v.id === versions?.latest.release && <span className="pill pill-accent">{t('versions.latest')}</span>}
              {v.id === versions?.latest.snapshot && v.type === 'snapshot' && <span className="pill pill-accent">{t('versions.latestSnapshot')}</span>}
              {v.installed && <span className="pill">{t('versions.installed')}</span>}
            </div>
            <span className="muted">{t(`type.${v.type}`)}</span>
            <span className="muted">{new Date(v.releaseTime).toLocaleDateString(locale)}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setCreating(v.id)}>
              <Icon name="plus" size={16} /> {t('versions.createInstance')}
            </button>
          </div>
        ))}
        {!list.length && <div className="muted pad">{versions ? t('versions.noMatch') : t('versions.loading')}</div>}
      </div>

      {creating && <CreateInstance presetVersion={creating} onClose={() => setCreating(null)} />}
    </div>
  )
}
