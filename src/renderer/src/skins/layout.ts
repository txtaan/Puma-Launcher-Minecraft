import type { SkinModel } from '@shared/types'

// How a 64×64 Minecraft skin maps onto the player model. Every body part is a box whose six faces are laid out on the
// texture as a cross: [right][front][left][back] in a row, with [top][bottom] above the front and left faces.
// "Right" and "left" are the player's own sides.

export const SKIN_SIZE = 64

export type Part = 'head' | 'body' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg'
export type Layer = 'base' | 'overlay'
export type Face = 'top' | 'bottom' | 'right' | 'front' | 'left' | 'back'

export const PARTS: Part[] = ['head', 'body', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg']
export const FACES: Face[] = ['top', 'bottom', 'right', 'front', 'left', 'back']

interface PartBox {
  /** Texture position of the base layer and of the overlay (second layer). */
  base: [number, number]
  overlay: [number, number]
  /** Width, height and depth in pixels. */
  size: [number, number, number]
}

export function partBoxes(model: SkinModel): Record<Part, PartBox> {
  const arm = model === 'slim' ? 3 : 4
  return {
    head: { base: [0, 0], overlay: [32, 0], size: [8, 8, 8] },
    body: { base: [16, 16], overlay: [16, 32], size: [8, 12, 4] },
    rightArm: { base: [40, 16], overlay: [40, 32], size: [arm, 12, 4] },
    leftArm: { base: [32, 48], overlay: [48, 48], size: [arm, 12, 4] },
    rightLeg: { base: [0, 16], overlay: [0, 32], size: [4, 12, 4] },
    leftLeg: { base: [16, 48], overlay: [0, 48], size: [4, 12, 4] }
  }
}

export interface FaceRect {
  part: Part
  layer: Layer
  face: Face
  x: number
  y: number
  w: number
  h: number
}

/** Where each face of a box sits on the texture. */
export function faceRects(u: number, v: number, w: number, h: number, d: number): Record<Face, [number, number, number, number]> {
  return {
    top: [u + d, v, w, d],
    bottom: [u + d + w, v, w, d],
    right: [u, v + d, d, h],
    front: [u + d, v + d, w, h],
    left: [u + d + w, v + d, d, h],
    back: [u + d * 2 + w, v + d, w, h]
  }
}

export interface SkinLayout {
  model: SkinModel
  faces: FaceRect[]
  /** Index into faces for every texture pixel (y * 64 + x), or -1 for pixels no face uses. */
  faceAt: Int16Array
  find(part: Part, layer: Layer, face: Face): FaceRect
}

const layouts = new Map<SkinModel, SkinLayout>()

export function skinLayout(model: SkinModel): SkinLayout {
  const cached = layouts.get(model)
  if (cached) return cached
  const faces: FaceRect[] = []
  const boxes = partBoxes(model)
  for (const part of PARTS) {
    const { size } = boxes[part]
    for (const layer of ['base', 'overlay'] as const) {
      const [u, v] = boxes[part][layer]
      const rects = faceRects(u, v, ...size)
      for (const face of FACES) {
        const [x, y, w, h] = rects[face]
        faces.push({ part, layer, face, x, y, w, h })
      }
    }
  }
  const faceAt = new Int16Array(SKIN_SIZE * SKIN_SIZE).fill(-1)
  faces.forEach((f, i) => {
    for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) faceAt[y * SKIN_SIZE + x] = i
  })
  const layout: SkinLayout = {
    model,
    faces,
    faceAt,
    find: (part, layer, face) => faces.find((f) => f.part === part && f.layer === layer && f.face === face)!
  }
  layouts.set(model, layout)
  return layout
}

const MIRROR_PART: Record<Part, Part> = {
  head: 'head',
  body: 'body',
  rightArm: 'leftArm',
  leftArm: 'rightArm',
  rightLeg: 'leftLeg',
  leftLeg: 'rightLeg'
}
const MIRROR_FACE: Record<Face, Face> = { top: 'top', bottom: 'bottom', front: 'front', back: 'back', right: 'left', left: 'right' }

/**
 * The pixel on the other side of the body: across the middle of the head and body, and onto the other arm or leg.
 * Mirroring flips each face horizontally and swaps the outer and inner sides, which is also how Minecraft builds the
 * left limbs of an old 64×32 skin. Returns -1 for pixels that aren't part of the model.
 */
export function mirrorPixel(layout: SkinLayout, index: number): number {
  const i = layout.faceAt[index]
  if (i < 0) return -1
  const f = layout.faces[i]
  const lx = (index % SKIN_SIZE) - f.x
  const ly = Math.floor(index / SKIN_SIZE) - f.y
  const g = layout.find(MIRROR_PART[f.part], f.layer, MIRROR_FACE[f.face])
  return (g.y + ly) * SKIN_SIZE + g.x + (g.w - 1 - lx)
}

// ---------------------------------------------------------------------------------------------------------------------
// Pixel operations on RGBA data (Uint8ClampedArray of 64×64×4)
// ---------------------------------------------------------------------------------------------------------------------

export type Pixels = Uint8ClampedArray

const alphaAt = (px: Pixels, x: number, y: number) => px[(y * SKIN_SIZE + x) * 4 + 3]

/** Slim skins leave the last two columns of the right arm's area empty; classic skins paint them. */
export function detectModel(px: Pixels): SkinModel {
  for (let y = 16; y < 32; y++) {
    for (const x of y < 20 ? [50, 51] : [54, 55]) if (alphaAt(px, x, y) !== 0) return 'classic'
  }
  return 'slim'
}

/**
 * Turn an old 64×32 skin (top half of a 64×64 image) into the modern layout: the left arm and leg are mirrors of the
 * right ones, as Minecraft draws them, and a hat layer painted fully opaque is treated as empty, as the game does.
 */
export function upgradeLegacy(px: Pixels): Pixels {
  const out = new Uint8ClampedArray(px)
  out.fill(0, 32 * SKIN_SIZE * 4)
  const layout = skinLayout('classic')
  for (const part of ['rightArm', 'rightLeg'] as const) {
    for (const face of FACES) {
      const f = layout.find(part, 'base', face)
      for (let y = f.y; y < f.y + f.h; y++) {
        for (let x = f.x; x < f.x + f.w; x++) copyPixel(out, y * SKIN_SIZE + x, out, mirrorPixel(layout, y * SKIN_SIZE + x))
      }
    }
  }
  let hatTransparent = false
  for (let y = 0; y < 16 && !hatTransparent; y++) for (let x = 32; x < 64; x++) if (alphaAt(out, x, y) < 128) hatTransparent = true
  if (!hatTransparent) for (let y = 0; y < 16; y++) for (let x = 32; x < 64; x++) out[(y * SKIN_SIZE + x) * 4 + 3] = 0
  return out
}

function copyPixel(from: Pixels, i: number, to: Pixels, j: number): void {
  if (j < 0) return
  to.set(from.subarray(i * 4, i * 4 + 4), j * 4)
}

/**
 * Convert a skin to the other arm width. Arm faces that span the arm's width are resampled (a 3 px wide face gets
 * its middle column doubled; a 4 px one loses its second column); every other pixel is copied as it is.
 */
export function convertModel(px: Pixels, from: SkinModel, to: SkinModel): Pixels {
  if (from === to) return new Uint8ClampedArray(px)
  const src = skinLayout(from)
  const dst = skinLayout(to)
  const out = new Uint8ClampedArray(px)
  for (const part of ['rightArm', 'leftArm'] as const) {
    for (const layer of ['base', 'overlay'] as const) {
      for (const face of FACES) {
        const f = src.find(part, layer, face)
        for (let y = f.y; y < f.y + f.h; y++) out.fill(0, (y * SKIN_SIZE + f.x) * 4, (y * SKIN_SIZE + f.x + f.w) * 4)
      }
      for (const face of FACES) {
        const f = src.find(part, layer, face)
        const g = dst.find(part, layer, face)
        for (let ly = 0; ly < g.h; ly++) {
          for (let lx = 0; lx < g.w; lx++) {
            const sx = Math.min(f.w - 1, Math.floor(((lx + 0.5) * f.w) / g.w))
            copyPixel(px, (f.y + ly) * SKIN_SIZE + f.x + sx, out, (g.y + ly) * SKIN_SIZE + g.x + lx)
          }
        }
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------------
// Statistics for the inspect view
// ---------------------------------------------------------------------------------------------------------------------

export interface SkinStats {
  /** Painted (non-transparent) pixels, base and overlay. */
  pixels: number
  /** Share of the overlay layer that is painted, 0–1. */
  overlayCoverage: number
  /** Distinct colours, most used first, with the parts they appear on. */
  palette: { hex: string; count: number; parts: Part[] }[]
  /** Painted pixels per part and layer. */
  parts: Record<Part, { base: number; overlay: number; baseTotal: number; overlayTotal: number }>
}

export function skinStats(px: Pixels, model: SkinModel): SkinStats {
  const layout = skinLayout(model)
  const colors = new Map<string, { count: number; parts: Set<Part> }>()
  const parts = Object.fromEntries(PARTS.map((p) => [p, { base: 0, overlay: 0, baseTotal: 0, overlayTotal: 0 }])) as SkinStats['parts']
  let pixels = 0
  let overlayPainted = 0
  let overlayTotal = 0
  for (let i = 0; i < SKIN_SIZE * SKIN_SIZE; i++) {
    const fi = layout.faceAt[i]
    if (fi < 0) continue
    const f = layout.faces[fi]
    const a = px[i * 4 + 3]
    const painted = a > 0
    const counts = parts[f.part]
    if (f.layer === 'base') counts.baseTotal++
    else (counts.overlayTotal++, overlayTotal++)
    if (!painted) continue
    if (f.layer === 'base') counts.base++
    else (counts.overlay++, overlayPainted++)
    pixels++
    const hex = `#${[px[i * 4], px[i * 4 + 1], px[i * 4 + 2]].map((c) => c.toString(16).padStart(2, '0')).join('')}`
    const entry = colors.get(hex) ?? { count: 0, parts: new Set<Part>() }
    entry.count++
    entry.parts.add(f.part)
    colors.set(hex, entry)
  }
  const palette = [...colors.entries()]
    .map(([hex, e]) => ({ hex, count: e.count, parts: PARTS.filter((p) => e.parts.has(p)) }))
    .sort((a, b) => b.count - a.count)
  return { pixels, overlayCoverage: overlayTotal ? overlayPainted / overlayTotal : 0, palette, parts }
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

/** The most used colours of a palette, skipping shades too close to one already picked. */
export function distinctColors(palette: { hex: string }[], count: number, minDistance = 40): string[] {
  const picked: number[][] = []
  const out: string[] = []
  for (const { hex } of palette) {
    const c = rgb(hex)
    if (picked.some((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) < minDistance)) continue
    picked.push(c)
    out.push(hex)
    if (out.length === count) break
  }
  return out
}
