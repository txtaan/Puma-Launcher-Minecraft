import type { SkinModel } from '@shared/types'
import { convertModel, mirrorPixel, SKIN_SIZE, skinLayout, type Layer, type Pixels } from './layout'

// The skin being edited: its pixels, the painting operations and the undo history. Kept outside React so painting
// a stroke never re-renders the page; the editor redraws the textures itself and asks React to update afterwards.

export type Tool = 'pencil' | 'eraser' | 'fill' | 'picker' | 'lighten' | 'darken'

export interface Paint {
  tool: Tool
  /** #rrggbb */
  color: string
  /** 0–255; the base layer is always painted opaque, as the game shows it. */
  alpha: number
  mirror: boolean
}

interface Snapshot {
  px: Pixels
  model: SkinModel
  revision: number
}

const HISTORY = 100
/** How much one pass of Lighten or Darken changes a pixel. */
const SHADE = 0.14
/** Fill spreads over shades this close (per channel), so it also fills fabric and fur with a little noise. */
const FILL_TOLERANCE = 12

export const hexToRgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
export const rgbToHex = (r: number, g: number, b: number) => `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`

export class SkinDocument {
  px: Pixels
  model: SkinModel
  revision = 0
  private savedRevision = 0
  private nextRevision = 1
  private undoStack: Snapshot[] = []
  private redoStack: Snapshot[] = []
  /** Pixels already changed by the current stroke (Lighten and Darken work once per pixel per stroke). */
  private touched: Set<number> | null = null
  private changed = false

  constructor(px: Pixels, model: SkinModel) {
    this.px = new Uint8ClampedArray(px)
    this.model = model
  }

  get layout() {
    return skinLayout(this.model)
  }
  get dirty(): boolean {
    return this.revision !== this.savedRevision
  }
  get canUndo(): boolean {
    return this.undoStack.length > 0
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0
  }
  markSaved(): void {
    this.savedRevision = this.revision
  }

  /** Start an undoable change (a stroke, a fill, a model switch). */
  begin(): void {
    this.undoStack.push(this.snapshot())
    if (this.undoStack.length > HISTORY) this.undoStack.shift()
    this.touched = new Set()
    this.changed = false
  }

  /** Finish the change; one that changed nothing leaves no step in the history. */
  end(): boolean {
    const changed = this.changed
    if (changed) {
      this.revision = this.nextRevision++
      this.redoStack = []
    } else this.undoStack.pop()
    this.touched = null
    this.changed = false
    return changed
  }

  undo(): void {
    const s = this.undoStack.pop()
    if (!s) return
    this.redoStack.push(this.snapshot())
    this.restore(s)
  }

  redo(): void {
    const s = this.redoStack.pop()
    if (!s) return
    this.undoStack.push(this.snapshot())
    this.restore(s)
  }

  private snapshot(): Snapshot {
    return { px: new Uint8ClampedArray(this.px), model: this.model, revision: this.revision }
  }

  private restore(s: Snapshot): void {
    this.px = s.px
    this.model = s.model
    this.revision = s.revision
  }

  layerOf(index: number): Layer | null {
    const f = this.layout.faceAt[index]
    return f < 0 ? null : this.layout.faces[f].layer
  }

  /** The square brush around a pixel, kept inside the face it is on. */
  footprint(index: number, size: number): number[] {
    const fi = this.layout.faceAt[index]
    if (fi < 0) return []
    const f = this.layout.faces[fi]
    const x0 = (index % SKIN_SIZE) - Math.floor((size - 1) / 2)
    const y0 = Math.floor(index / SKIN_SIZE) - Math.floor((size - 1) / 2)
    const out: number[] = []
    for (let y = Math.max(f.y, y0); y < Math.min(f.y + f.h, y0 + size); y++) {
      for (let x = Math.max(f.x, x0); x < Math.min(f.x + f.w, x0 + size); x++) out.push(y * SKIN_SIZE + x)
    }
    return out
  }

  /** The pixels a tool would change: the footprint, plus its reflection when mirroring. */
  reach(indices: number[], mirror: boolean): number[] {
    if (!mirror) return indices
    const all = new Set(indices)
    for (const i of indices) {
      const m = mirrorPixel(this.layout, i)
      if (m >= 0) all.add(m)
    }
    return [...all]
  }

  /** Pencil, eraser, lighten or darken on these pixels (call between begin and end). */
  stroke(indices: number[], paint: Paint): void {
    const [r, g, b] = hexToRgb(paint.color)
    for (const i of this.reach(indices, paint.mirror)) {
      const layer = this.layerOf(i)
      if (!layer) continue
      const o = i * 4
      const px = this.px
      if (paint.tool === 'pencil') {
        this.set(o, r, g, b, layer === 'base' ? 255 : paint.alpha)
      } else if (paint.tool === 'eraser') {
        this.set(o, 0, 0, 0, 0)
      } else if (paint.tool === 'lighten' || paint.tool === 'darken') {
        if (this.touched?.has(i) || px[o + 3] === 0) continue
        this.touched?.add(i)
        const shade = (c: number) => Math.round(paint.tool === 'lighten' ? c + (255 - c) * SHADE : c * (1 - SHADE))
        this.set(o, shade(px[o]), shade(px[o + 1]), shade(px[o + 2]), px[o + 3])
      }
    }
  }

  /** Flood-fill the area of one colour (give or take a few shades) around a pixel, within its face (and the mirrored area). */
  fill(index: number, paint: Paint): void {
    const starts = this.reach([index], paint.mirror)
    const [r, g, b] = hexToRgb(paint.color)
    for (const start of starts) {
      const fi = this.layout.faceAt[start]
      if (fi < 0) continue
      const f = this.layout.faces[fi]
      const alpha = f.layer === 'base' ? 255 : paint.alpha
      const target = this.px.slice(start * 4, start * 4 + 4)
      if (target[0] === r && target[1] === g && target[2] === b && target[3] === alpha) continue
      const same = (i: number) => {
        const o = i * 4
        if ((this.px[o + 3] === 0) !== (target[3] === 0)) return false
        if (target[3] === 0) return true
        return [0, 1, 2, 3].every((k) => Math.abs(this.px[o + k] - target[k]) <= FILL_TOLERANCE)
      }
      const queue = [start]
      const seen = new Set([start])
      while (queue.length) {
        const i = queue.pop()!
        this.set(i * 4, r, g, b, alpha)
        const x = i % SKIN_SIZE
        const y = Math.floor(i / SKIN_SIZE)
        for (const [nx, ny] of [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1]
        ]) {
          if (nx < f.x || nx >= f.x + f.w || ny < f.y || ny >= f.y + f.h) continue
          const n = ny * SKIN_SIZE + nx
          if (!seen.has(n) && same(n)) {
            seen.add(n)
            queue.push(n)
          }
        }
      }
    }
  }

  /** The colour of a pixel as #rrggbb and its alpha. */
  colorAt(index: number): { color: string; alpha: number } {
    const o = index * 4
    return { color: rgbToHex(this.px[o], this.px[o + 1], this.px[o + 2]), alpha: this.px[o + 3] }
  }

  /** Switch arm width, resampling the arms (undoable). */
  setModel(model: SkinModel): void {
    if (model === this.model) return
    this.begin()
    this.px = convertModel(this.px, this.model, model)
    this.model = model
    this.changed = true
    this.end()
  }

  /**
   * The texture to show: the pixels, with the pixels under the cursor lightened so you can see where you'll paint.
   * Transparent second-layer pixels under the cursor are shown half see-through.
   */
  render(target: ImageData, hover: number[]): void {
    target.data.set(this.px)
    for (const i of hover) {
      const o = i * 4
      const d = target.data
      if (d[o + 3] === 0) {
        d[o] = d[o + 1] = d[o + 2] = 255
        d[o + 3] = this.layerOf(i) === 'overlay' ? 110 : 255
      } else {
        d[o] = d[o] + (255 - d[o]) * 0.45
        d[o + 1] = d[o + 1] + (255 - d[o + 1]) * 0.45
        d[o + 2] = d[o + 2] + (255 - d[o + 2]) * 0.45
        d[o + 3] = Math.max(d[o + 3], 160)
      }
    }
  }

  private set(o: number, r: number, g: number, b: number, a: number): void {
    const px = this.px
    if (a === 0) r = g = b = 0
    if (px[o] === r && px[o + 1] === g && px[o + 2] === b && px[o + 3] === a) return
    px[o] = r
    px[o + 1] = g
    px[o + 2] = b
    px[o + 3] = a
    this.changed = true
  }
}
