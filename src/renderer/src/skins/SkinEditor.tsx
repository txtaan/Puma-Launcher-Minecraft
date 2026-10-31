import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { MOUSE } from 'three'
import type { MessageKey } from '@shared/i18n'
import type { SkinModel } from '@shared/types'
import { api, errorMessage } from '../api'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Icon } from '../components/Icon'
import { useStore } from '../store'
import { MODEL_LABEL, PART_COLOR, PART_LABEL } from './common'
import { SkinDocument, type Paint, type Tool } from './editor'
import { context, newCanvas, readPixels, withAlternate } from './image'
import { distinctColors, PARTS, SKIN_SIZE, skinLayout, skinStats, type Layer, type Part } from './layout'
import { PlayerScene } from './player'
import { templatePixels, type TemplateId } from './templates'

const TOOLS: { id: Tool; icon: string; label: MessageKey; key: string }[] = [
  { id: 'pencil', icon: 'pencil', label: 'skins.tool.pencil', key: 'b' },
  { id: 'eraser', icon: 'eraser', label: 'skins.tool.eraser', key: 'e' },
  { id: 'fill', icon: 'bucket', label: 'skins.tool.fill', key: 'g' },
  { id: 'picker', icon: 'pipette', label: 'skins.tool.picker', key: 'i' },
  { id: 'lighten', icon: 'sun', label: 'skins.tool.lighten', key: 'l' },
  { id: 'darken', icon: 'moon', label: 'skins.tool.darken', key: 'd' }
]
/** Shortcut names as macOS writes them. */
const shortcut = (label: string) => (api.platform === 'darwin' ? label.replace(/Ctrl\+(Shift|Maiusc)\+/, '⇧⌘').replace('Ctrl+', '⌘') : label)
const MAP_SIZE = 512
const SCALE = MAP_SIZE / SKIN_SIZE

/**
 * The Puma skin editor: paint on the 3D model or on the flat texture, with a mirror that follows the body (left arm ↔
 * right arm, not just the texture's halves), fills that stay inside one face, both layers, and a long undo history.
 */
export function SkinEditor({ skinId, template, model, onClose }: { skinId?: string; template?: TemplateId; model?: SkinModel; onClose: (savedId?: string) => void }) {
  const { skins, account, setSkins, refreshSkins, toast, t, setLeaveGuard } = useStore()
  const existing = skinId ? skins?.skins.find((s) => s.id === skinId) : undefined
  const startName = existing?.name ?? (template && template !== 'blank' ? t(`skins.template.${template}`) : '')
  const [id, setId] = useState(skinId)
  const [name, setName] = useState(startName)
  const [savedName, setSavedName] = useState(startName)
  const [, setVersion] = useState(0)
  const bump = useCallback(() => setVersion((v) => v + 1), [])
  const [ready, setReady] = useState(false)
  const [tool, setToolState] = useState<Tool>('pencil')
  const [brush, setBrush] = useState(1)
  const [mirror, setMirror] = useState(false)
  const [layer, setLayerState] = useState<Layer>('base')
  const [visible, setVisible] = useState({ base: true, overlay: true })
  const [hiddenParts, setHiddenParts] = useState<Part[]>([])
  const [color, setColor] = useState('#5485a7')
  const [hexDraft, setHexDraft] = useState('#5485a7')
  const [alpha, setAlpha] = useState(255)
  const [recent, setRecent] = useState<string[]>([])
  const [grid, setGrid] = useState(true)
  const [saving, setSaving] = useState(false)
  const [leaving, setLeaving] = useState<(() => void) | null>(null)

  const doc = useRef<SkinDocument | null>(null)
  const scene = useRef<PlayerScene | null>(null)
  const stage = useRef<HTMLDivElement>(null)
  const map = useRef<HTMLCanvasElement>(null)
  const source = useRef<HTMLCanvasElement>(newCanvas())
  const frame = useRef<ImageData>(new ImageData(SKIN_SIZE, SKIN_SIZE))
  const hover = useRef<number[]>([])
  const painting = useRef<{ x: number; y: number } | null>(null)
  const previousTool = useRef<Tool>('pencil')
  const opts = useRef({ tool, brush, mirror, layer, color, alpha, grid })
  opts.current = { tool, brush, mirror, layer, color, alpha, grid }

  const setTool = useCallback((next: Tool) => {
    setToolState((current) => {
      if (next === 'picker' && current !== 'picker') previousTool.current = current
      return next
    })
  }, [])
  const setLayer = useCallback((next: Layer) => {
    setLayerState(next)
    setVisible((v) => ({ ...v, [next]: true }))
  }, [])

  // ---- Drawing -------------------------------------------------------------------------------------------------

  const drawMap = useCallback(() => {
    const d = doc.current
    const canvas = map.current
    if (!d || !canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE)
    const layout = skinLayout(d.model)
    // Checkerboard under see-through pixels, only where the texture is used.
    for (const f of layout.faces) {
      for (let y = f.y; y < f.y + f.h; y++) {
        for (let x = f.x; x < f.x + f.w; x++) {
          ctx.fillStyle = (x + y) % 2 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)'
          ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE)
        }
      }
    }
    ctx.drawImage(source.current, 0, 0, MAP_SIZE, MAP_SIZE)
    if (opts.current.grid) {
      ctx.strokeStyle = 'rgba(0,0,0,0.22)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (const f of layout.faces) {
        for (let x = f.x + 1; x < f.x + f.w; x++) {
          ctx.moveTo(x * SCALE + 0.5, f.y * SCALE)
          ctx.lineTo(x * SCALE + 0.5, (f.y + f.h) * SCALE)
        }
        for (let y = f.y + 1; y < f.y + f.h; y++) {
          ctx.moveTo(f.x * SCALE, y * SCALE + 0.5)
          ctx.lineTo((f.x + f.w) * SCALE, y * SCALE + 0.5)
        }
      }
      ctx.stroke()
    }
    // Face outlines; the faces of the layer being painted stand out.
    for (const f of layout.faces) {
      ctx.strokeStyle = f.layer === opts.current.layer ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.18)'
      ctx.strokeRect(f.x * SCALE + 0.5, f.y * SCALE + 0.5, f.w * SCALE - 1, f.h * SCALE - 1)
    }
  }, [])

  const redraw = useCallback(() => {
    const d = doc.current
    if (!d) return
    d.render(frame.current, hover.current)
    context(source.current).putImageData(frame.current, 0, 0)
    const s = scene.current
    if (s) {
      s.player.setModel(d.model)
      s.player.refresh()
      s.invalidate()
    }
    drawMap()
  }, [drawMap])

  // ---- Setup ---------------------------------------------------------------------------------------------------

  useEffect(() => {
    let live = true
    void (async () => {
      const startModel = existing?.model ?? model ?? 'classic'
      const px = existing ? await readPixels(existing.png) : templatePixels(template ?? 'blank', startModel)
      if (!live) return
      doc.current = new SkinDocument(px, startModel)
      const s = new PlayerScene(stage.current!, source.current, startModel)
      s.controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.ROTATE }
      scene.current = s
      setReady(true)
      redraw()
    })()
    return () => {
      live = false
      scene.current?.dispose()
      scene.current = null
    }
    // The editor opens one skin for its whole life (the parent gives it a new key for another one).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const s = scene.current
    if (!s) return
    s.player.setVisible({ ...visible, parts: Object.fromEntries(PARTS.map((p) => [p, !hiddenParts.includes(p)])) as Record<Part, boolean> })
    s.invalidate()
  }, [visible, hiddenParts, ready])

  useEffect(drawMap, [grid, layer, drawMap])

  // ---- Painting ------------------------------------------------------------------------------------------------

  const paint = (): Paint => ({ tool: opts.current.tool, color: opts.current.color, alpha: opts.current.alpha, mirror: opts.current.mirror })

  /** What a tool would change at a pixel, for the cursor preview. */
  const preview = (index: number | null): number[] => {
    const d = doc.current
    if (!d || index === null) return []
    const { tool: tl, brush: size, mirror: m } = opts.current
    if (tl === 'picker') return [index]
    return d.reach(tl === 'fill' ? [index] : d.footprint(index, size), m)
  }

  const pickColor = (index: number) => {
    const d = doc.current
    if (!d) return
    const c = d.colorAt(index)
    if (c.alpha === 0) return
    setColor(c.color)
    setHexDraft(c.color)
    setAlpha(d.layerOf(index) === 'overlay' ? c.alpha : 255)
    if (opts.current.tool === 'picker') setTool(previousTool.current)
  }

  /** Colour under the cursor on the model: the second layer where it is painted, else the base. */
  const pickColorOnModel = (x: number, y: number) => {
    const s = scene.current
    const d = doc.current
    if (!s || !d) return
    const top = s.pick(x, y, 'overlay')
    const hit = top && d.px[top.index * 4 + 3] > 0 ? top : s.pick(x, y, 'base')
    if (hit) pickColor(hit.index)
  }

  const finishStroke = () => {
    const d = doc.current
    painting.current = null
    if (scene.current) scene.current.controls.enabled = true
    if (!d) return
    if (d.end() && (opts.current.tool === 'pencil' || opts.current.tool === 'fill')) {
      const c = opts.current.color
      setRecent((r) => [c, ...r.filter((x) => x !== c)].slice(0, 12))
    }
    redraw()
    bump()
  }

  const applyAt = (index: number) => {
    const d = doc.current!
    if (opts.current.tool === 'fill') d.fill(index, paint())
    else d.stroke(d.footprint(index, opts.current.brush), paint())
  }

  // On the model: a left press on the skin paints; anywhere else (or with the right button) it turns the model.
  const onStageDown = (e: ReactPointerEvent) => {
    const s = scene.current
    const d = doc.current
    if (!s || !d || e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey) return
    if (opts.current.tool === 'picker' || e.altKey) {
      pickColorOnModel(e.clientX, e.clientY)
      s.controls.enabled = false
      window.addEventListener('pointerup', () => (s.controls.enabled = true), { once: true })
      return
    }
    const hit = s.pick(e.clientX, e.clientY, opts.current.layer)
    if (!hit) return
    s.controls.enabled = false
    d.begin()
    applyAt(hit.index)
    redraw()
    if (opts.current.tool === 'fill') {
      window.addEventListener('pointerup', finishStroke, { once: true })
      return
    }
    painting.current = { x: e.clientX, y: e.clientY }
    const move = (ev: PointerEvent) => {
      const last = painting.current
      if (!last) return
      const dx = ev.clientX - last.x
      const dy = ev.clientY - last.y
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 2))
      for (let k = 1; k <= steps; k++) {
        const h = s.pick(last.x + (dx * k) / steps, last.y + (dy * k) / steps, opts.current.layer)
        if (h) applyAt(h.index)
      }
      painting.current = { x: ev.clientX, y: ev.clientY }
      const h = s.pick(ev.clientX, ev.clientY, opts.current.layer)
      hover.current = preview(h?.index ?? null)
      redraw()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener(
      'pointerup',
      () => {
        window.removeEventListener('pointermove', move)
        finishStroke()
      },
      { once: true }
    )
  }

  const onStageHover = (e: ReactPointerEvent) => {
    if (painting.current || e.buttons) return
    const hit = scene.current?.pick(e.clientX, e.clientY, opts.current.layer)
    hover.current = preview(hit?.index ?? null)
    redraw()
  }

  const clearHover = () => {
    if (!hover.current.length) return
    hover.current = []
    redraw()
  }

  // On the flat texture: every face of both layers can be painted directly.
  const mapPixel = (e: ReactPointerEvent<HTMLCanvasElement>): number | null => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = Math.floor(((e.clientX - r.left) / r.width) * SKIN_SIZE)
    const y = Math.floor(((e.clientY - r.top) / r.height) * SKIN_SIZE)
    if (x < 0 || y < 0 || x >= SKIN_SIZE || y >= SKIN_SIZE) return null
    const i = y * SKIN_SIZE + x
    return doc.current && doc.current.layerOf(i) ? i : null
  }
  const lastMapPixel = useRef<number | null>(null)

  const onMapDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = doc.current
    const i = mapPixel(e)
    if (!d || i === null || e.button !== 0) return
    if (opts.current.tool === 'picker' || e.altKey) return pickColor(i)
    e.currentTarget.setPointerCapture(e.pointerId)
    d.begin()
    applyAt(i)
    lastMapPixel.current = opts.current.tool === 'fill' ? null : i
    redraw()
    if (opts.current.tool === 'fill') finishStroke()
  }

  const onMapMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const i = mapPixel(e)
    const last = lastMapPixel.current
    if (last !== null && i !== null) {
      // Fill the gap between two pointer events with a straight line of pixels.
      const [x0, y0, x1, y1] = [last % SKIN_SIZE, Math.floor(last / SKIN_SIZE), i % SKIN_SIZE, Math.floor(i / SKIN_SIZE)]
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
      for (let k = 1; k <= steps; k++) {
        const p = Math.round(y0 + ((y1 - y0) * k) / steps) * SKIN_SIZE + Math.round(x0 + ((x1 - x0) * k) / steps)
        if (doc.current?.layerOf(p)) applyAt(p)
      }
      lastMapPixel.current = i
    }
    hover.current = preview(i)
    redraw()
  }

  const onMapUp = () => {
    if (lastMapPixel.current === null) return
    lastMapPixel.current = null
    finishStroke()
  }

  // ---- History, model, saving ----------------------------------------------------------------------------------

  const undo = useCallback(() => {
    doc.current?.undo()
    redraw()
    bump()
  }, [redraw, bump])
  const redo = useCallback(() => {
    doc.current?.redo()
    redraw()
    bump()
  }, [redraw, bump])

  const switchModel = (m: SkinModel) => {
    doc.current?.setModel(m)
    redraw()
    bump()
  }

  const dirty = !!doc.current?.dirty || name !== savedName

  const save = async () => {
    const d = doc.current
    if (!d || saving) return
    setSaving(true)
    try {
      const entry = await api.skins.save({ id, name, ...withAlternate(d.px, d.model), source: existing?.source ?? 'created' })
      d.markSaved()
      setId(entry.id)
      setName(entry.name)
      setSavedName(entry.name)
      await refreshSkins()
      // A Microsoft account wearing this skin gets the new version uploaded.
      if (account?.type === 'microsoft' && skins?.equipped[account.id] === entry.id) setSkins(await api.skins.equip(account.id, entry.id))
      toast(t('skins.saved', { name: entry.name }), 'success')
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
    setSaving(false)
    bump()
  }
  const saveRef = useRef(save)
  saveRef.current = save

  const exportPng = async () => {
    const d = doc.current
    if (!d) return
    const path = await api.skins.exportPng(name || t('skins.untitled'), withAlternate(d.px, d.model).png).catch((err) => {
      toast(errorMessage(err), 'error')
      return null
    })
    if (path) toast(t('skins.savedTo', { path }), 'success')
  }

  const close = () => onClose(!skinId && id ? id : undefined)
  const requestClose = () => (dirty ? setLeaving(() => close) : close())

  useEffect(() => {
    setLeaveGuard(dirty ? (proceed) => setLeaving(() => proceed) : null)
    return () => setLeaveGuard(null)
  }, [dirty, setLeaveGuard])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && key === 's') {
        e.preventDefault()
        void saveRef.current()
        return
      }
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return
      if (mod && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && key === 'y') {
        e.preventDefault()
        redo()
      } else if (!mod && !e.altKey) {
        const tl = TOOLS.find((x) => x.key === key)
        if (tl) setTool(tl.id)
        else if (key === 'm') setMirror((m) => !m)
        else if (key === '[') setBrush((b) => Math.max(1, b - 1))
        else if (key === ']') setBrush((b) => Math.min(3, b + 1))
        else if (key === 'x') setLayer(opts.current.layer === 'base' ? 'overlay' : 'base')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, setTool, setLayer])

  const d = doc.current
  const revision = d?.revision
  const used = useMemo(() => (d ? distinctColors(skinStats(d.px, d.model).palette, 18, 14) : []), [d, revision, d?.model]) // eslint-disable-line react-hooks/exhaustive-deps
  const chooseColor = (c: string) => {
    setColor(c)
    setHexDraft(c)
  }

  return (
    <div className="editor">
      <header className="editor-bar">
        <button className="icon-btn" aria-label={t('common.back')} title={t('common.back')} onClick={requestClose}>
          <Icon name="arrowLeft" />
        </button>
        <input className="editor-name" value={name} size={Math.max(12, (name || t('skins.untitled')).length + 1)} maxLength={48} placeholder={t('skins.untitled')} aria-label={t('skins.editor.name')} onChange={(e) => setName(e.target.value)} />
        {dirty && <span className="dirty-dot" aria-hidden />}
        <div className="grow" />
        <button className="icon-btn" disabled={!d?.canUndo} aria-label={shortcut(t('skins.editor.undo'))} title={shortcut(t('skins.editor.undo'))} onClick={undo}>
          <Icon name="undo" />
        </button>
        <button className="icon-btn" disabled={!d?.canRedo} aria-label={shortcut(t('skins.editor.redo'))} title={shortcut(t('skins.editor.redo'))} onClick={redo}>
          <Icon name="redo" />
        </button>
        <div className="segmented" title={t('skins.editor.arms')}>
          {(['classic', 'slim'] as const).map((m) => (
            <button key={m} className={d?.model === m ? 'active' : ''} onClick={() => switchModel(m)}>
              {t(MODEL_LABEL[m])}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => void exportPng()}>
          <Icon name="download" size={16} /> {t('skins.export')}
        </button>
        <button className="btn btn-primary btn-sm" disabled={saving || !ready} onClick={() => void save()}>
          {saving ? <span className="spinner sm" /> : <Icon name="save" size={16} />} {t('common.save')}
        </button>
      </header>

      <div className="editor-body">
        <div className="editor-tools">
          {TOOLS.map((tl) => (
            <button key={tl.id} className={`tool ${tool === tl.id ? 'active' : ''}`} aria-label={t(tl.label)} title={t(tl.label)} onClick={() => setTool(tl.id)}>
              <Icon name={tl.icon} />
            </button>
          ))}
          <span className="tool-sep" />
          {[1, 2, 3].map((size) => (
            <button key={size} className={`tool brush ${brush === size ? 'active' : ''}`} aria-label={`${t('skins.editor.brush')}: ${size}`} title={t('skins.editor.brush')} onClick={() => setBrush(size)}>
              <i style={{ width: 3 + size * 3, height: 3 + size * 3 }} />
            </button>
          ))}
          <span className="tool-sep" />
          <button className={`tool ${mirror ? 'active' : ''}`} aria-pressed={mirror} aria-label={t('skins.editor.mirror')} title={t('skins.editor.mirror')} onClick={() => setMirror(!mirror)}>
            <Icon name="mirror" />
          </button>
        </div>

        <div className="editor-stage" onPointerDownCapture={onStageDown} onPointerMove={onStageHover} onPointerLeave={clearHover} onContextMenu={(e) => e.preventDefault()}>
          <div ref={stage} className="editor-canvas" />
          {!ready && <span className="spinner editor-loading" />}
          <p className="editor-help">{t('skins.editor.help')}</p>
        </div>

        <aside className="editor-panel">
          <section>
            <h3>{t('skins.editor.colour')}</h3>
            <div className="colour-row">
              <label className="colour-swatch" style={{ background: color, opacity: layer === 'overlay' ? Math.max(0.25, alpha / 255) : 1 }}>
                <input type="color" value={color} aria-label={t('skins.editor.colour')} onChange={(e) => chooseColor(e.target.value)} />
              </label>
              <input
                className="hex-input"
                value={hexDraft}
                spellCheck={false}
                aria-label="Hex"
                onChange={(e) => {
                  const v = e.target.value.trim()
                  setHexDraft(v)
                  if (/^#?[0-9a-f]{6}$/i.test(v)) setColor(`#${v.replace('#', '').toLowerCase()}`)
                }}
                onBlur={() => setHexDraft(color)}
              />
            </div>
            <label className={`opacity-row ${layer === 'base' ? 'disabled' : ''}`} title={layer === 'base' ? t('skins.editor.opacityHint') : undefined}>
              <span>{t('skins.editor.opacity')}</span>
              <input type="range" min={10} max={100} step={5} disabled={layer === 'base'} value={layer === 'base' ? 100 : Math.round((alpha / 255) * 100)} onChange={(e) => setAlpha(Math.round((Number(e.target.value) / 100) * 255))} />
              <span className="opacity-value">{layer === 'base' ? 100 : Math.round((alpha / 255) * 100)}%</span>
            </label>
            {recent.length > 0 && (
              <>
                <span className="panel-label">{t('skins.editor.recent')}</span>
                <div className="swatches">
                  {recent.map((c) => (
                    <button key={c} className={c === color ? 'active' : ''} style={{ background: c }} title={c} aria-label={c} onClick={() => chooseColor(c)} />
                  ))}
                </div>
              </>
            )}
            <span className="panel-label">{t('skins.editor.used')}</span>
            <div className="swatches">
              {used.map((c) => (
                <button key={c} className={c === color ? 'active' : ''} style={{ background: c }} title={c} aria-label={c} onClick={() => chooseColor(c)} />
              ))}
            </div>
          </section>

          <section>
            <h3>{t('skins.editor.layers')}</h3>
            {(['overlay', 'base'] as const).map((l) => (
              <div key={l} className={`layer-row ${layer === l ? 'active' : ''}`}>
                <button className="icon-btn" aria-label={t('skins.editor.toggleLayer')} title={t('skins.editor.toggleLayer')} onClick={() => setVisible((v) => ({ ...v, [l]: !v[l] }))}>
                  <Icon name={visible[l] ? 'eye' : 'eyeOff'} size={16} />
                </button>
                <button className="layer-pick" title={t('skins.editor.paintOn')} onClick={() => setLayer(l)}>
                  <span>{t(l === 'base' ? 'skins.layer.base' : 'skins.layer.overlay')}</span>
                  {layer === l && <Icon name="pencil" size={14} />}
                </button>
              </div>
            ))}
          </section>

          <section>
            <h3>{t('skins.editor.parts')}</h3>
            <div className="part-chips">
              {PARTS.map((p) => (
                <button key={p} className={`chip toggle-chip ${hiddenParts.includes(p) ? 'off' : ''}`} onClick={() => setHiddenParts((h) => (h.includes(p) ? h.filter((x) => x !== p) : [...h, p]))}>
                  <i style={{ background: PART_COLOR[p] }} />
                  {t(PART_LABEL[p])}
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="row">
              <h3 className="grow">{t('skins.editor.texture')}</h3>
              <label className="check">
                <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> {t('skins.editor.grid')}
              </label>
            </div>
            <canvas
              ref={map}
              className="texture-map"
              width={MAP_SIZE}
              height={MAP_SIZE}
              onPointerDown={onMapDown}
              onPointerMove={onMapMove}
              onPointerUp={onMapUp}
              onPointerLeave={() => {
                if (lastMapPixel.current === null) clearHover()
              }}
            />
          </section>
        </aside>
      </div>

      {leaving && (
        <ConfirmDialog
          title={t('skins.editor.unsavedTitle')}
          text={t('skins.editor.unsavedText', { name: name || t('skins.untitled') })}
          confirm={t('skins.editor.discard')}
          cancel={t('skins.editor.keep')}
          danger
          onClose={() => setLeaving(null)}
          onConfirm={() => {
            setLeaveGuard(null)
            leaving()
          }}
        />
      )}
    </div>
  )
}
