import { useEffect, useRef, type RefObject } from 'react'
import type { SkinModel } from '@shared/types'
import { context, loadImage, newCanvas } from './image'
import { PARTS, SKIN_SIZE, type Part } from './layout'
import { PlayerScene, type Animation } from './player'

export interface ViewerOptions {
  animation?: Animation
  /** Show the second layer (default true). */
  overlay?: boolean
  /** Parts to hide. */
  hidden?: Part[]
  /** Colours (#rrggbb) to pick out: every other pixel is dimmed. */
  highlight?: string[]
  /** Zoom with the scroll wheel (default true). Off where the wheel should scroll the page. */
  zoom?: boolean
}

/** A turnable 3D player wearing a skin. */
export function SkinViewer({
  png,
  model,
  animation = 'idle',
  overlay = true,
  hidden,
  highlight,
  zoom = true,
  sceneRef,
  className
}: ViewerOptions & { png: string; model: SkinModel; sceneRef?: RefObject<PlayerScene | null>; className?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<PlayerScene | null>(null)
  const source = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    source.current = newCanvas()
    const s = new PlayerScene(host.current!, source.current, model)
    s.controls.enableZoom = zoom
    scene.current = s
    if (sceneRef) sceneRef.current = s
    return () => {
      s.dispose()
      scene.current = null
      if (sceneRef) sceneRef.current = null
    }
    // The scene lives as long as the component; later changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const highlightKey = highlight?.join(',') ?? ''
  useEffect(() => {
    let live = true
    void loadImage(png).then((img) => {
      const s = scene.current
      if (!live || !s || !source.current) return
      const ctx = context(source.current)
      ctx.clearRect(0, 0, SKIN_SIZE, SKIN_SIZE)
      ctx.drawImage(img, 0, 0)
      if (highlight?.length) dimExcept(ctx, new Set(highlight))
      s.player.setModel(model)
      applyVisibility(s, overlay, hidden)
      s.player.refresh()
      s.invalidate()
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [png, model, highlightKey])

  const hiddenKey = hidden?.join(',') ?? ''
  useEffect(() => {
    if (!scene.current) return
    applyVisibility(scene.current, overlay, hidden)
    scene.current.invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay, hiddenKey])

  useEffect(() => {
    scene.current?.setAnimation(animation)
  }, [animation])

  return <div ref={host} className={`skin-viewer ${className ?? ''}`} />
}

function applyVisibility(s: PlayerScene, overlay: boolean, hidden: Part[] | undefined): void {
  const parts = Object.fromEntries(PARTS.map((p) => [p, !hidden?.includes(p)])) as Record<Part, boolean>
  s.player.setVisible({ base: true, overlay, parts })
}

/** Darken and grey out every pixel whose colour isn't in `keep`. */
function dimExcept(ctx: CanvasRenderingContext2D, keep: Set<string>): void {
  const data = ctx.getImageData(0, 0, SKIN_SIZE, SKIN_SIZE)
  const px = data.data
  for (let i = 0; i < px.length; i += 4) {
    const hex = `#${[px[i], px[i + 1], px[i + 2]].map((c) => c.toString(16).padStart(2, '0')).join('')}`
    if (keep.has(hex)) continue
    const grey = (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) * 0.3
    px[i] = px[i + 1] = px[i + 2] = grey
  }
  ctx.putImageData(data, 0, 0)
}
