import { useState } from 'react'
import type { MessageKey } from '@shared/i18n'
import type { SkinEntry } from '@shared/types'
import { Icon } from '../components/Icon'
import type { SkinActions, SkinView } from '../pages/Skins'
import { useStore } from '../store'
import { MODEL_LABEL, SkinThumb, SOURCE_LABEL, templateSkin } from './common'
import { useThumbnail } from './thumbnails'

type Category = 'all' | 'classic' | 'slim' | 'favorites' | 'created' | 'imported'

const CATEGORIES: { id: Category; label: MessageKey; test: (s: SkinEntry) => boolean }[] = [
  { id: 'all', label: 'skins.cat.all', test: () => true },
  { id: 'favorites', label: 'skins.cat.favorites', test: (s) => s.favorite },
  { id: 'classic', label: 'skins.cat.classic', test: (s) => s.model === 'classic' },
  { id: 'slim', label: 'skins.cat.slim', test: (s) => s.model === 'slim' },
  { id: 'created', label: 'skins.cat.created', test: (s) => s.source === 'created' },
  { id: 'imported', label: 'skins.cat.imported', test: (s) => s.source !== 'created' }
]

/** Every skin: filters on the left, cards on the right. */
export function SkinWardrobe({ go, actions }: { go: (v: SkinView) => void; actions: SkinActions }) {
  const { skins, t } = useStore()
  const [category, setCategory] = useState<Category>('all')
  const [query, setQuery] = useState('')
  const list = skins?.skins ?? []
  const active = CATEGORIES.find((c) => c.id === category)!
  const q = query.trim().toLowerCase()
  const shown = list.filter((s) => active.test(s) && (!q || s.name.toLowerCase().includes(q)))
  // The skin being worn always comes first.
  shown.sort((a, b) => Number(b.id === actions.wornId) - Number(a.id === actions.wornId))
  const here: SkinView = { kind: 'wardrobe' }

  return (
    <div className="wardrobe">
      <aside className="wardrobe-side">
        <button className="back-link" onClick={() => go({ kind: 'home' })}>
          <Icon name="arrowLeft" size={16} /> {t('skins.title')}
        </button>
        <label className="search wardrobe-search">
          <Icon name="search" size={16} />
          <input value={query} placeholder={t('skins.search')} aria-label={t('skins.search')} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <h3 className="section-title">{t('skins.collection')}</h3>
        <nav className="wardrobe-cats">
          {CATEGORIES.map((c) => (
            <button key={c.id} className={`nav-item ${c.id === category ? 'active' : ''}`} onClick={() => setCategory(c.id)}>
              <span>{t(c.label)}</span>
              <span className="pill">{list.filter(c.test).length}</span>
            </button>
          ))}
        </nav>
        <div className="card news-card release wardrobe-promo">
          <SkinThumb skin={templateSkin('puma')} className="wardrobe-promo-art" />
          <span className="badge">{t('skins.create')}</span>
          <strong>{t('skins.promoTitle')}</strong>
          <p className="muted">{t('skins.promoText')}</p>
          <button className="btn btn-primary btn-sm" onClick={() => go({ kind: 'editor', template: 'puma', back: here })}>
            <Icon name="plus" size={16} /> {t('skins.newSkin')}
          </button>
        </div>
      </aside>

      <section className="wardrobe-main">
        <div className="page-head">
          <div>
            <h1>{t(active.label)}</h1>
            <p className="muted">{shown.length === 1 ? t('skins.countOne') : t('skins.count', { count: shown.length })}</p>
          </div>
        </div>
        {shown.length ? (
          <div className="skin-grid">
            {shown.map((s) => (
              <SkinCard
                key={s.id}
                skin={s}
                worn={s.id === actions.wornId}
                busy={actions.busy === s.id}
                actions={actions}
                onOpen={() => go({ kind: 'inspect', id: s.id })}
                onEdit={() => go({ kind: 'editor', id: s.id, back: here })}
              />
            ))}
          </div>
        ) : (
          <div className="card empty">
            <Icon name="shirt" size={28} />
            <p>{q ? t('skins.noResults', { query }) : t('skins.empty')}</p>
          </div>
        )}
      </section>
    </div>
  )
}

function SkinCard({
  skin,
  worn,
  busy,
  actions,
  onOpen,
  onEdit
}: {
  skin: SkinEntry
  worn: boolean
  busy: boolean
  actions: SkinActions
  onOpen: () => void
  onEdit: () => void
}) {
  const { t } = useStore()
  const thumb = useThumbnail(skin)
  return (
    <article className={`card skin-card ${worn ? 'worn' : ''}`}>
      <button className="skin-cover" aria-label={`${t('skins.inspect')}: ${skin.name}`} onClick={onOpen}>
        {thumb ? <img src={thumb.url} alt="" draggable={false} /> : <span className="skin-cover-placeholder" />}
        {worn && <span className="pill pill-accent skin-worn">{t('skins.worn')}</span>}
      </button>
      <button
        className={`icon-btn skin-bookmark ${skin.favorite ? 'on' : ''}`}
        aria-label={t(skin.favorite ? 'skins.unbookmark' : 'skins.bookmark')}
        title={t(skin.favorite ? 'skins.unbookmark' : 'skins.bookmark')}
        onClick={() => void actions.toggleFavorite(skin)}
      >
        <Icon name={skin.favorite ? 'bookmarkFilled' : 'bookmark'} size={16} />
      </button>
      <div className="skin-info">
        <strong title={skin.name}>{skin.name}</strong>
        <span className="muted">
          {t(MODEL_LABEL[skin.model])} · {t(SOURCE_LABEL[skin.source])}
        </span>
        <span className="skin-dots" aria-hidden>
          {(thumb?.colors ?? []).map((c) => (
            <i key={c} style={{ background: c }} />
          ))}
        </span>
      </div>
      <div className="skin-actions">
        <button className={`btn btn-sm ${worn ? 'btn-ghost' : 'btn-primary'}`} disabled={busy} onClick={() => void actions.equip(worn ? null : skin)}>
          {busy ? <span className="spinner sm" /> : <Icon name={worn ? 'minus' : 'shirt'} size={14} />} {t(worn ? 'skins.takeOff' : 'skins.wear')}
        </button>
        <button className="icon-btn" title={t('skins.inspect')} aria-label={t('skins.inspect')} onClick={onOpen}>
          <Icon name="search" size={16} />
        </button>
        <button className="icon-btn" title={t('skins.edit')} aria-label={t('skins.edit')} onClick={onEdit}>
          <Icon name="pencil" size={16} />
        </button>
      </div>
    </article>
  )
}
