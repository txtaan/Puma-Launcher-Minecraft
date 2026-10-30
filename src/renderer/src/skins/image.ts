import type { RawSkin, SkinModel, SkinSaveInput } from '@shared/types'
import { convertModel, detectModel, SKIN_SIZE, upgradeLegacy, type Pixels } from './layout'

// Canvas helpers: skins travel as PNG data URLs and are edited as 64×64 RGBA pixel arrays.

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image'))
    img.src = src
  })
}

export function newCanvas(w = SKIN_SIZE, h = SKIN_SIZE): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

export const context = (c: HTMLCanvasElement) => c.getContext('2d', { willReadFrequently: true })!

export async function readPixels(png: string): Promise<Pixels> {
  const img = await loadImage(png)
  const c = newCanvas()
  context(c).drawImage(img, 0, 0)
  return context(c).getImageData(0, 0, SKIN_SIZE, SKIN_SIZE).data
}

export function pixelsToPng(px: Pixels): string {
  const c = newCanvas()
  context(c).putImageData(new ImageData(new Uint8ClampedArray(px), SKIN_SIZE, SKIN_SIZE), 0, 0)
  return c.toDataURL('image/png')
}

export class SkinImageError extends Error {}

/**
 * Turn a skin from a file or a player profile into what the library stores: a 64×64 PNG (old 64×32 skins are
 * upgraded), its arm width (detected when the source doesn't say) and the same skin at the other arm width.
 */
export async function prepareSkin(raw: RawSkin): Promise<Omit<SkinSaveInput, 'name'>> {
  const img = await loadImage(raw.png).catch(() => {
    throw new SkinImageError()
  })
  if (img.width !== SKIN_SIZE || (img.height !== SKIN_SIZE && img.height !== SKIN_SIZE / 2)) throw new SkinImageError()
  const c = newCanvas()
  context(c).drawImage(img, 0, 0)
  let px: Pixels = context(c).getImageData(0, 0, SKIN_SIZE, SKIN_SIZE).data
  const legacy = img.height === SKIN_SIZE / 2
  if (legacy) px = upgradeLegacy(px)
  // The old 64×32 format predates slim arms.
  const model: SkinModel = raw.model ?? (legacy ? 'classic' : detectModel(px))
  return withAlternate(px, model)
}

/** The PNG plus the other-arm-width copy the game needs for offline play. */
export function withAlternate(px: Pixels, model: SkinModel): Omit<SkinSaveInput, 'name'> {
  const other: SkinModel = model === 'slim' ? 'classic' : 'slim'
  return { model, png: pixelsToPng(px), alternate: pixelsToPng(convertModel(px, model, other)) }
}

/** The face (8×8) with its hat layer, for avatars. */
export async function faceImage(png: string, size = 64): Promise<string> {
  const img = await loadImage(png)
  const c = newCanvas(size, size)
  const ctx = context(c)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, 8, 8, 8, 8, 0, 0, size, size)
  ctx.drawImage(img, 40, 8, 8, 8, 0, 0, size, size)
  return c.toDataURL('image/png')
}
