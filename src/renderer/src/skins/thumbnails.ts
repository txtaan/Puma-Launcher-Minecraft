import { useEffect, useState } from 'react'
import * as THREE from 'three'
import type { SkinModel } from '@shared/types'
import { context, loadImage, newCanvas } from './image'
import { distinctColors, skinStats, SKIN_SIZE } from './layout'
import { PlayerModel } from './player'

// Still pictures of skins for cards and lists, drawn one at a time by a single offscreen renderer: a page full of
// thumbnails then needs one WebGL context instead of one per card (browsers only allow a handful).

const WIDTH = 240
const HEIGHT = 360

let renderer: THREE.WebGLRenderer | null = null
let source: HTMLCanvasElement
let player: PlayerModel
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera

function setup(): void {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setSize(WIDTH, HEIGHT, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  source = newCanvas()
  player = new PlayerModel(source, 'classic')
  scene = new THREE.Scene()
  scene.add(player.group)
  camera = new THREE.PerspectiveCamera(30, WIDTH / HEIGHT, 1, 400)
  const angle = 0.42
  camera.position.set(Math.sin(angle) * 72, 25, Math.cos(angle) * 72)
  camera.lookAt(0, 15.6, 0)
}

export interface Thumbnail {
  /** A three-quarter view of the whole player (PNG data URL). */
  url: string
  /** The skin's three main colours. */
  colors: string[]
}

const cache = new Map<string, Thumbnail>()
let queue: Promise<unknown> = Promise.resolve()

/** Draw a skin's thumbnail. `key` names this version of the skin for the cache. */
export function renderThumbnail(png: string, model: SkinModel, key: string): Promise<Thumbnail> {
  const cached = cache.get(key)
  if (cached) return Promise.resolve(cached)
  const job = queue.then(async () => {
    if (cache.has(key)) return cache.get(key)!
    if (!renderer) setup()
    const img = await loadImage(png)
    const ctx = context(source)
    ctx.clearRect(0, 0, source.width, source.height)
    ctx.drawImage(img, 0, 0)
    player.setModel(model)
    player.refresh()
    player.resetPose()
    player.parts.rightArm.pivot.rotation.set(-0.12, 0, -0.06)
    player.parts.leftArm.pivot.rotation.set(0.12, 0, 0.06)
    player.parts.rightLeg.pivot.rotation.x = 0.1
    player.parts.leftLeg.pivot.rotation.x = -0.1
    player.parts.head.pivot.rotation.y = -0.12
    renderer!.render(scene, camera)
    const px = ctx.getImageData(0, 0, SKIN_SIZE, SKIN_SIZE).data
    const thumb = { url: renderer!.domElement.toDataURL('image/png'), colors: distinctColors(skinStats(px, model).palette, 3) }
    cache.set(key, thumb)
    return thumb
  })
  queue = job.catch(() => undefined)
  return job
}

/** The thumbnail of a skin (null until it is drawn). */
export function useThumbnail(skin: { png: string; model: SkinModel; id: string; updatedAt: number } | undefined): Thumbnail | null {
  const key = skin ? `${skin.id}:${skin.updatedAt}:${skin.model}` : ''
  const [url, setUrl] = useState<Thumbnail | null>(() => cache.get(key) ?? null)
  useEffect(() => {
    if (!skin) return setUrl(null)
    let live = true
    setUrl(cache.get(key) ?? null)
    renderThumbnail(skin.png, skin.model, key).then(
      (u) => live && setUrl(u),
      () => undefined
    )
    return () => {
      live = false
    }
    // The key covers every field of the skin that changes the picture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return url
}
