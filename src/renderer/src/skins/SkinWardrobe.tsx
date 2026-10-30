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

/** Every skin, as a store shelf: filters on the left, cards on the right. */
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
        <label className="ds-search">
          <input value={query} placeholder={`${t('skins.search')}_`} aria-label={t('skins.search')} onChange={(e) => setQuery(e.target.value)} />
          <Icon name="search" size={16} />
        </label>
        <h3 className="ds-heading">{t('skins.collection')}</h3>
        <nav className="ds-cats">
          {CATEGORIES.map((c) => (
            <button key={c.id} className={c.id === category ? 'active' : ''} onClick={() => setCategory(c.id)}>
              <span>{t(c.label)}</span>
              <span className="ds-count">{list.filter(c.test).length}</span>
            </button>
          ))}
        </nav>
        <div className="ds-promo">
          <SkinThumb skin={templateSkin('puma')} className="ds-promo-art" />
          <strong>{t('skins.promoTitle')}</strong>
          <p>{t('skins.promoText')}</p>
          <button className="btn btn-primary btn-sm" onClick={() => go({ kind: 'editor', template: 'puma', back: here })}>
            <Icon name="plus" size={16} /> {t('skins.newSkin')}
          </button>
        </div>
      </aside>

      <section className="wardrobe-main">
        <h2 className="ds-title">
          <span className="ds-marker" aria-hidden />
          {t(active.label)}
          <span className="ds-title-count">{shown.length}</span>
        </h2>
        {shown.length ? (
          <div className="ds-grid">
            {shown.map((s) => (
              <WardrobeCard key={s.id} skin={s} worn={s.id === actions.wornId} busy={actions.busy === s.id} actions={actions} onOpen={() => go({ kind: 'inspect', id: s.id })} />
            ))}
          </div>
        ) : (
          <div className="ds-empty">
            <Icon name="shirt" size={28} />
            <p>{q ? t('skins.noResults', { query }) : t('skins.empty')}</p>
          </div>
        )}
      </section>
    </div>
  )
}

function WardrobeCard({ skin, worn, busy, actions, onOpen }: { skin: SkinEntry; worn: boolean; busy: boolean; actions: SkinActions; onOpen: () => void }) {
  const { t } = useStore()
  const thumb = useThumbnail(skin)
  return (
    <div className={`ds-card-frame ${worn ? 'worn' : ''}`}>
      <article className="ds-card" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
        {worn && <span className="ds-worn">{t('skins.worn')}</span>}
        <button
          className={`ds-bookmark ${skin.favorite ? 'on' : ''}`}
          aria-label={t(skin.favorite ? 'skins.unbookmark' : 'skins.bookmark')}
          title={t(skin.favorite ? 'skins.unbookmark' : 'skins.bookmark')}
          onClick={(e) => {
            e.stopPropagation()
            void actions.toggleFavorite(skin)
          }}
        >
          <Icon name={skin.favorite ? 'bookmarkFilled' : 'bookmark'} size={18} />
        </button>
        {thumb ? <img className="ds-art" src={thumb.url} alt="" draggable={false} /> : <span className="ds-art placeholder" />}
        <div className="ds-foot">
          <div className="ds-meta">
            <strong>{skin.name}</strong>
            <span>
              {t(MODEL_LABEL[skin.model])} · {t(SOURCE_LABEL[skin.source])}
            </span>
            <span className="ds-dots" aria-hidden>
              {(thumb?.colors ?? []).map((c) => (
                <i key={c} style={{ background: c }} />
              ))}
            </span>
          </div>
          <button
            className="ds-equip"
            disabled={busy}
            aria-label={t(worn ? 'skins.takeOff' : 'skins.wear')}
            title={t(worn ? 'skins.takeOff' : 'skins.wear')}
            onClick={(e) => {
              e.stopPropagation()
              void actions.equip(worn ? null : skin)
            }}
          >
            {busy ? <span className="spinner sm" /> : <Icon name={worn ? 'minus' : 'plus'} size={18} />}
          </button>
        </div>
      </article>
    </div>
  )
}
