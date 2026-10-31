import { useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Icon } from '../components/Icon'
import type { SkinActions, SkinView } from '../pages/Skins'
import { useStore } from '../store'
import { prefersReducedMotion } from '../theme'
import { MODEL_LABEL, PART_COLOR, PART_LABEL, RenameDialog, SkinFace, SOURCE_LABEL } from './common'
import { readPixels } from './image'
import { ServerSkinDialog } from './ServerSkin'
import { PARTS, skinStats, type Part, type SkinStats } from './layout'
import type { Animation, PlayerScene } from './player'
import { SkinViewer } from './SkinViewer'

type Tab = 'palette' | 'parts'

/** One skin up close: the list of skins on the left, the model, its numbers and its colours on the right. */
export function SkinInspect({ id, go, actions }: { id: string; go: (v: SkinView) => void; actions: SkinActions }) {
  const { skins, account, t, locale } = useStore()
  const list = skins?.skins ?? []
  const skin = list.find((s) => s.id === id)
  const [query, setQuery] = useState('')
  const [stats, setStats] = useState<SkinStats | null>(null)
  const [playing, setPlaying] = useState(() => !prefersReducedMotion())
  const [motion, setMotion] = useState<Exclude<Animation, 'none'>>('idle')
  const [overlay, setOverlay] = useState(true)
  const [tab, setTab] = useState<Tab>('palette')
  const [highlight, setHighlight] = useState<string[]>([])
  const [hidden, setHidden] = useState<Part[]>([])
  const [dialog, setDialog] = useState<'rename' | 'delete' | 'server' | null>(null)
  const scene = useRef<PlayerScene | null>(null)

  useEffect(() => {
    if (skins && !skin) go({ kind: 'wardrobe' })
  }, [skins, skin, go])

  useEffect(() => {
    setHighlight([])
    setHidden([])
  }, [id])

  useEffect(() => {
    if (!skin) return
    let live = true
    void readPixels(skin.png).then((px) => live && setStats(skinStats(px, skin.model)))
    return () => {
      live = false
    }
  }, [skin?.png, skin?.model]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!skin) return null
  const worn = skin.id === actions.wornId
  const q = query.trim().toLowerCase()
  const rows = list.filter((s) => !q || s.name.toLowerCase().includes(q))
  const date = (ms: number) => new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
  const short = (ms: number) => new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
  const here: SkinView = { kind: 'inspect', id }
  const number = (n: number) => n.toLocaleString(locale)
  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item])

  return (
    <div className="inspect">
      <aside className="inspect-list">
        <button className="back-link" onClick={() => go({ kind: 'wardrobe' })}>
          <Icon name="arrowLeft" size={16} /> {t('skins.wardrobe')}
        </button>
        <label className="pill-search">
          <Icon name="search" size={15} />
          <input value={query} placeholder={t('skins.search')} aria-label={t('skins.search')} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="inspect-rows">
          {rows.map((s) => (
            <button key={s.id} className={`inspect-row ${s.id === id ? 'active' : ''}`} onClick={() => go({ kind: 'inspect', id: s.id })}>
              <SkinFace png={s.png} size={38} />
              <span className="inspect-row-text">
                <strong>{s.name}</strong>
                <span>
                  {t(MODEL_LABEL[s.model])} · {short(s.updatedAt)}
                </span>
              </span>
              {s.id === actions.wornId && <span className="worn-dot" title={t('skins.worn')} />}
            </button>
          ))}
        </div>
      </aside>

      <section className="inspect-main">
        <header className="inspect-head">
          <div className="inspect-title">
            <span className="badge">{t(SOURCE_LABEL[skin.source])}</span>
            <h1>{skin.name}</h1>
          </div>
          <div className="inspect-actions">
            <button className={`icon-btn ${skin.favorite ? 'on' : ''}`} title={t(skin.favorite ? 'skins.unbookmark' : 'skins.bookmark')} aria-label={t(skin.favorite ? 'skins.unbookmark' : 'skins.bookmark')} onClick={() => void actions.toggleFavorite(skin)}>
              <Icon name={skin.favorite ? 'bookmarkFilled' : 'bookmark'} />
            </button>
            <button className="icon-btn" title={t('skins.edit')} aria-label={t('skins.edit')} onClick={() => go({ kind: 'editor', id: skin.id, back: here })}>
              <Icon name="pencil" />
            </button>
            <button
              className="icon-btn"
              title={t('skins.duplicate')}
              aria-label={t('skins.duplicate')}
              onClick={async () => {
                const copy = await actions.duplicate(skin)
                if (copy) go({ kind: 'inspect', id: copy.id })
              }}
            >
              <Icon name="copy" />
            </button>
            <button className="icon-btn" title={t('skins.export')} aria-label={t('skins.export')} onClick={() => void actions.exportPng(skin.name, skin.png)}>
              <Icon name="download" />
            </button>
            <button className="icon-btn" title={t('skins.rename')} aria-label={t('skins.rename')} onClick={() => setDialog('rename')}>
              <Icon name="rename" />
            </button>
            <button className="icon-btn danger" title={t('common.delete')} aria-label={t('common.delete')} onClick={() => setDialog('delete')}>
              <Icon name="trash" />
            </button>
            {/* The labelled buttons wrap together under the tools when the row is narrow */}
            <div className="inspect-buttons">
              {/* Labelled, unlike the tools: players look for this one */}
              <button className="btn btn-ghost btn-sm" onClick={() => setDialog('server')}>
                <Icon name="server" size={16} /> {t('skins.server')}
              </button>
              <button className={`btn btn-sm ${worn ? 'btn-ghost' : 'btn-primary'}`} disabled={actions.busy === skin.id} onClick={() => void actions.equip(worn ? null : skin)}>
                {actions.busy === skin.id ? <span className="spinner sm" /> : <Icon name={worn ? 'minus' : 'shirt'} size={16} />}
                {t(worn ? 'skins.takeOff' : 'skins.wear')}
              </button>
            </div>
          </div>
        </header>

        <div className="inspect-stage">
          <SkinViewer png={skin.png} model={skin.model} animation={playing ? motion : 'none'} overlay={overlay} hidden={hidden} highlight={highlight} sceneRef={scene} />
          <div className="stage-tools left">
            <button className="stage-btn" title={t(playing ? 'skins.pause' : 'skins.play')} aria-label={t(playing ? 'skins.pause' : 'skins.play')} onClick={() => setPlaying(!playing)}>
              <Icon name={playing ? 'pause' : 'play'} size={16} />
            </button>
            <button
              className="stage-btn"
              title={t('skins.screenshot')}
              aria-label={t('skins.screenshot')}
              onClick={() => scene.current && void actions.exportPng(`${skin.name} (3D)`, scene.current.screenshot())}
            >
              <Icon name="camera" size={16} />
            </button>
          </div>
          <div className="stage-tools right">
            <div className="segmented">
              {(['idle', 'walk'] as const).map((m) => (
                <button
                  key={m}
                  className={playing && motion === m ? 'active' : ''}
                  onClick={() => {
                    setMotion(m)
                    setPlaying(true)
                  }}
                >
                  {t(m === 'idle' ? 'skins.anim.idle' : 'skins.anim.walk')}
                </button>
              ))}
            </div>
            <button className={`stage-btn wide ${overlay ? 'on' : ''}`} onClick={() => setOverlay(!overlay)}>
              <Icon name={overlay ? 'eye' : 'eyeOff'} size={16} /> {t('skins.secondLayer')}
            </button>
          </div>
        </div>

        <div className="inspect-facts">
          <dl className="inspect-stats">
            <div>
              <dt>{t('skins.stat.arms')}</dt>
              <dd>{t(MODEL_LABEL[skin.model])}</dd>
            </div>
            <div>
              <dt>{t('skins.stat.pixels')}</dt>
              <dd>{stats ? number(stats.pixels) : '—'}</dd>
            </div>
            <div>
              <dt>{t('skins.stat.overlay')}</dt>
              <dd>{stats ? `${Math.round(stats.overlayCoverage * 100)}%` : '—'}</dd>
            </div>
            <div>
              <dt>{t('skins.stat.colors')}</dt>
              <dd>{stats ? number(stats.palette.length) : '—'}</dd>
            </div>
          </dl>
          <p className="inspect-about">
            {t(`skins.about.${skin.source}`, { date: date(skin.createdAt) })}{' '}
            {skin.updatedAt - skin.createdAt > 60_000 && `${t('skins.about.edited', { date: date(skin.updatedAt) })} `}
            {stats && (stats.overlayCoverage > 0 ? t('skins.about.layers', { percent: Math.round(stats.overlayCoverage * 100) }) : t('skins.about.noLayer'))}{' '}
            {worn && account && t('skins.about.worn', { name: account.username })}
          </p>
        </div>

        <div className="inspect-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'palette'} className={tab === 'palette' ? 'active' : ''} onClick={() => setTab('palette')}>
            {t('skins.tab.palette')} <span className="tab-count">{stats?.palette.length ?? 0}</span>
          </button>
          <button role="tab" aria-selected={tab === 'parts'} className={tab === 'parts' ? 'active' : ''} onClick={() => setTab('parts')}>
            {t('skins.tab.parts')} <span className="tab-count">{PARTS.length}</span>
          </button>
          <span className="tab-hint">{t(tab === 'palette' ? 'skins.paletteHint' : 'skins.partsHint')}</span>
        </div>

        {stats && tab === 'palette' && (
          <div className="inspect-table">
            <div className="itable-row head palette">
              <span />
              <span>{t('skins.col.colour')}</span>
              <span>{t('skins.col.pixels')}</span>
              <span>{t('skins.col.usedOn')}</span>
            </div>
            {stats.palette.slice(0, 80).map((c) => (
              <label key={c.hex} className={`itable-row palette ${highlight.includes(c.hex) ? 'checked' : ''}`}>
                <input type="checkbox" checked={highlight.includes(c.hex)} onChange={() => setHighlight(toggle(highlight, c.hex))} />
                <span className="swatch-cell">
                  <i className="swatch" style={{ background: c.hex }} />
                  <code>{c.hex}</code>
                </span>
                <span className="count-cell">
                  {number(c.count)}
                  <i className="bar" style={{ width: `${Math.max(4, (c.count / stats.palette[0].count) * 100)}%` }} />
                </span>
                <span className="chips">
                  {c.parts.map((p) => (
                    <span key={p} className="chip">
                      <i style={{ background: PART_COLOR[p] }} />
                      {t(PART_LABEL[p])}
                    </span>
                  ))}
                </span>
              </label>
            ))}
          </div>
        )}

        {stats && tab === 'parts' && (
          <div className="inspect-table">
            <div className="itable-row head parts">
              <span />
              <span>{t('skins.col.part')}</span>
              <span>{t('skins.col.base')}</span>
              <span>{t('skins.col.overlay')}</span>
            </div>
            {PARTS.map((p) => {
              const c = stats.parts[p]
              return (
                <label key={p} className={`itable-row parts ${hidden.includes(p) ? '' : 'checked'}`}>
                  <input type="checkbox" checked={!hidden.includes(p)} onChange={() => setHidden(toggle(hidden, p))} />
                  <span className="chip plain">
                    <i style={{ background: PART_COLOR[p] }} />
                    {t(PART_LABEL[p])}
                  </span>
                  <Meter value={c.base} total={c.baseTotal} locale={locale} />
                  <Meter value={c.overlay} total={c.overlayTotal} locale={locale} />
                </label>
              )
            })}
          </div>
        )}
      </section>

      {dialog === 'server' && <ServerSkinDialog skin={skin} onClose={() => setDialog(null)} />}
      {dialog === 'rename' && <RenameDialog skin={skin} onClose={() => setDialog(null)} onRename={(name) => void actions.rename(skin, name)} />}
      {dialog === 'delete' && (
        <ConfirmDialog
          title={t('skins.deleteTitle')}
          text={t('skins.deleteConfirm', { name: skin.name })}
          confirm={t('common.delete')}
          cancel={t('common.cancel')}
          danger
          onClose={() => setDialog(null)}
          onConfirm={() => void actions.remove(skin)}
        />
      )}
    </div>
  )
}

function Meter({ value, total, locale }: { value: number; total: number; locale: string | undefined }) {
  return (
    <span className="meter-cell">
      <span className="meter">
        <i style={{ width: `${total ? (value / total) * 100 : 0}%` }} />
      </span>
      {value.toLocaleString(locale)} / {total.toLocaleString(locale)}
    </span>
  )
}
