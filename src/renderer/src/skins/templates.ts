import type { SkinModel } from '@shared/types'
import { FACES, SKIN_SIZE, skinLayout, type Face, type Part, type Pixels } from './layout'

// Starting points for new skins, drawn in code (original artwork, no Mojang textures).

export type TemplateId = 'puma' | 'explorer' | 'blank'
export const TEMPLATES: TemplateId[] = ['puma', 'explorer', 'blank']

type RGB = [number, number, number]
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]

/** Small, repeatable brightness noise so flat areas look like fabric or fur rather than plastic. */
function grain(x: number, y: number, amount: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return (n - Math.floor(n) - 0.5) * amount
}

class Painter {
  readonly px: Pixels = new Uint8ClampedArray(SKIN_SIZE * SKIN_SIZE * 4)
  private readonly layout

  constructor(model: SkinModel) {
    this.layout = skinLayout(model)
  }

  set(x: number, y: number, color: RGB, noise = 10, alpha = 255): void {
    const i = (y * SKIN_SIZE + x) * 4
    const g = grain(x, y, noise)
    this.px[i] = color[0] + g
    this.px[i + 1] = color[1] + g
    this.px[i + 2] = color[2] + g
    this.px[i + 3] = alpha
  }

  /** Paint a face of a part; `color` can depend on the pixel's position within the face. */
  face(part: Part, face: Face, color: RGB | ((lx: number, ly: number, w: number, h: number) => RGB | null), layer: 'base' | 'overlay' = 'base', noise = 10): void {
    const f = this.layout.find(part, layer, face)
    for (let ly = 0; ly < f.h; ly++) {
      for (let lx = 0; lx < f.w; lx++) {
        const c = typeof color === 'function' ? color(lx, ly, f.w, f.h) : color
        if (c) this.set(f.x + lx, f.y + ly, c, noise)
      }
    }
  }

  part(part: Part, color: RGB | ((face: Face, lx: number, ly: number, w: number, h: number) => RGB | null), layer: 'base' | 'overlay' = 'base', noise = 10): void {
    for (const face of FACES) this.face(part, face, typeof color === 'function' ? (lx, ly, w, h) => color(face, lx, ly, w, h) : color, layer, noise)
  }
}

interface Look {
  skin: RGB
  hair: RGB
  eyes: RGB
  eyeWhite: RGB
  mouth: RGB
  shirt: RGB
  trim: RGB
  pants: RGB
  shoes: RGB
}

/** A person: hair, face, shirt with sleeves, trousers and shoes. */
function person(model: SkinModel, look: Look): Painter {
  const p = new Painter(model)
  p.part('head', (face, lx, ly) => {
    if (face === 'top' || face === 'back') return look.hair
    if (face === 'bottom') return look.skin
    if (face === 'front') {
      if (ly < 2) return look.hair
      if (ly === 4 && (lx === 1 || lx === 5)) return look.eyeWhite
      if (ly === 4 && (lx === 2 || lx === 6)) return look.eyes
      if (ly === 6 && lx >= 3 && lx <= 4) return look.mouth
      return look.skin
    }
    return ly < 3 ? look.hair : look.skin
  })
  p.part('body', (face, lx, ly) => (face === 'front' && ly === 0 && lx >= 2 && lx <= 5 ? look.trim : look.shirt))
  for (const arm of ['rightArm', 'leftArm'] as const) {
    p.part(arm, (face, _lx, ly) => (face === 'top' || ly < 4 ? look.shirt : look.skin))
  }
  for (const leg of ['rightLeg', 'leftLeg'] as const) {
    p.part(leg, (face, _lx, ly) => (face === 'bottom' || ly >= 10 ? look.shoes : look.pants))
  }
  return p
}

/** The Puma: a black panther suit with amber eyes and the launcher's night-blue accents. */
function puma(model: SkinModel): Painter {
  const fur = hex('#1d1d26')
  const furLight = hex('#2b2b38')
  const amber = hex('#e5a43d')
  const blue = hex('#5485a7')
  const p = new Painter(model)
  p.part('head', (face, lx, ly) => {
    if (face !== 'front') return fur
    if (ly === 3 && (lx === 1 || lx === 2 || lx === 5 || lx === 6)) return amber
    if (ly === 4 && (lx === 2 || lx === 5)) return hex('#111116')
    if (ly === 5 && lx >= 3 && lx <= 4) return hex('#3a3a48')
    if (ly === 6 && lx >= 2 && lx <= 5) return furLight
    return fur
  }, 'base', 8)
  // Ears on the hat layer's top corners.
  p.face('head', 'top', (lx, ly, w) => ((lx <= 1 || lx >= w - 2) && ly >= 2 && ly <= 3 ? fur : null), 'overlay', 6)
  p.face('head', 'front', (lx, ly, w) => ((lx <= 1 || lx >= w - 2) && ly === 0 ? fur : null), 'overlay', 6)
  p.part('body', (face, lx, ly, w) => {
    if (face === 'front' && (lx === 3 || lx === 4) && ly >= 1) return blue
    if (face === 'front' && ly === 0) return furLight
    return face === 'back' && lx === Math.floor(w / 2) ? furLight : fur
  }, 'base', 8)
  for (const arm of ['rightArm', 'leftArm'] as const) {
    p.part(arm, (face, _lx, ly) => (face === 'bottom' || ly >= 11 ? amber : ly === 3 ? blue : fur), 'base', 8)
  }
  for (const leg of ['rightLeg', 'leftLeg'] as const) {
    p.part(leg, (face, _lx, ly) => (face === 'bottom' || ly >= 11 ? hex('#111116') : ly === 6 ? blue : fur), 'base', 8)
  }
  return p
}

export function templatePixels(id: TemplateId, model: SkinModel): Pixels {
  if (id === 'puma') return puma(model).px
  if (id === 'explorer') {
    return person(model, {
      skin: hex('#c68863'),
      hair: hex('#4a2f1d'),
      eyes: hex('#3d6fa8'),
      eyeWhite: hex('#f2f2f2'),
      mouth: hex('#8c4f3a'),
      shirt: hex('#3f7d4f'),
      trim: hex('#2f5e3b'),
      pants: hex('#8c7a58'),
      shoes: hex('#4a3423')
    }).px
  }
  return person(model, {
    skin: hex('#c9c9d2'),
    hair: hex('#b4b4bf'),
    eyes: hex('#6b6b78'),
    eyeWhite: hex('#e8e8ee'),
    mouth: hex('#a3a3ae'),
    shirt: hex('#bdbdc7'),
    trim: hex('#adadb8'),
    pants: hex('#a9a9b4'),
    shoes: hex('#8f8f9a')
  }).px
}
