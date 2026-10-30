import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { SkinModel } from '@shared/types'
import { faceRects, partBoxes, PARTS, SKIN_SIZE, skinLayout, type Face, type Layer, type Part } from './layout'

// The player model and a small scene around it: a viewer (orbit, animations, screenshots) that the editor also uses
// to paint on the model. Units are skin pixels; the feet stand at y = 0 and the model faces +z.

/** BoxGeometry's face order: +x (the player's left), -x (right), +y, -y, +z (front), -z (back). */
const BOX_FACES: Face[] = ['left', 'right', 'top', 'bottom', 'front', 'back']
/** Gentle per-face shading, like the game's, so the shape reads without lighting tinting the colours. */
const FACE_SHADE: Record<Face, number> = { top: 1, front: 1, right: 0.86, left: 0.86, back: 0.8, bottom: 0.7 }
/** Inset of a hundredth of a pixel so nearest-pixel sampling never picks a neighbour across a face edge. */
const EDGE = 0.01

function boxGeometry(u: number, v: number, w: number, h: number, d: number, grow: number): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(w + grow * 2, h + grow * 2, d + grow * 2)
  const rects = faceRects(u, v, w, h, d)
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute
  const colors = new Float32Array(24 * 3)
  BOX_FACES.forEach((face, fi) => {
    const [x, y, fw, fh] = rects[face]
    const u0 = (x + EDGE) / SKIN_SIZE
    const u1 = (x + fw - EDGE) / SKIN_SIZE
    const top = 1 - (y + EDGE) / SKIN_SIZE
    const bottom = 1 - (y + fh - EDGE) / SKIN_SIZE
    // Each face's vertices run top-left, top-right, bottom-left, bottom-right as seen from outside. The game draws
    // the bottom face's texture upside down compared with the top one.
    const corners = face === 'bottom' ? [u0, bottom, u1, bottom, u0, top, u1, top] : [u0, top, u1, top, u0, bottom, u1, bottom]
    for (let k = 0; k < 4; k++) {
      uv.setXY(fi * 4 + k, corners[k * 2], corners[k * 2 + 1])
      colors.fill(FACE_SHADE[face], (fi * 4 + k) * 3, (fi * 4 + k) * 3 + 3)
    }
  })
  uv.needsUpdate = true
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

interface PartMeshes {
  pivot: THREE.Group
  base: THREE.Mesh
  overlay: THREE.Mesh
}

/** Where each part hangs from (shoulders, hips, neck) and where its box sits relative to that point. */
function rig(model: SkinModel): Record<Part, { pivot: [number, number, number]; offset: [number, number, number] }> {
  const slim = model === 'slim'
  return {
    head: { pivot: [0, 24, 0], offset: [0, 4, 0] },
    body: { pivot: [0, 24, 0], offset: [0, -6, 0] },
    rightArm: slim ? { pivot: [-5, 21.5, 0], offset: [-0.5, -4, 0] } : { pivot: [-5, 22, 0], offset: [-1, -4, 0] },
    leftArm: slim ? { pivot: [5, 21.5, 0], offset: [0.5, -4, 0] } : { pivot: [5, 22, 0], offset: [1, -4, 0] },
    rightLeg: { pivot: [-2, 12, 0], offset: [0, -6, 0] },
    leftLeg: { pivot: [2, 12, 0], offset: [0, -6, 0] }
  }
}

export class PlayerModel {
  readonly group = new THREE.Group()
  readonly texture: THREE.CanvasTexture
  parts!: Record<Part, PartMeshes>
  model: SkinModel
  private readonly baseMaterial: THREE.MeshBasicMaterial
  private readonly overlayMaterial: THREE.MeshBasicMaterial

  constructor(source: HTMLCanvasElement, model: SkinModel) {
    this.texture = new THREE.CanvasTexture(source)
    this.texture.magFilter = THREE.NearestFilter
    this.texture.minFilter = THREE.NearestFilter
    this.texture.generateMipmaps = false
    this.texture.colorSpace = THREE.SRGBColorSpace
    // The base layer is opaque in game (empty pixels show black); the overlay can be see-through.
    this.baseMaterial = new THREE.MeshBasicMaterial({ map: this.texture, vertexColors: true })
    this.overlayMaterial = new THREE.MeshBasicMaterial({
      map: this.texture,
      vertexColors: true,
      transparent: true,
      alphaTest: 1 / 255,
      side: THREE.DoubleSide
    })
    this.model = model
    this.build(model)
  }

  private build(model: SkinModel): void {
    this.group.clear()
    const boxes = partBoxes(model)
    const placement = rig(model)
    const parts = {} as Record<Part, PartMeshes>
    for (const part of PARTS) {
      const { size } = boxes[part]
      const grow = part === 'head' ? 0.5 : 0.25
      const base = new THREE.Mesh(boxGeometry(...boxes[part].base, ...size, 0), this.baseMaterial)
      const overlay = new THREE.Mesh(boxGeometry(...boxes[part].overlay, ...size, grow), this.overlayMaterial)
      base.userData = { part, layer: 'base' }
      overlay.userData = { part, layer: 'overlay' }
      overlay.renderOrder = 1
      const pivot = new THREE.Group()
      pivot.position.set(...placement[part].pivot)
      for (const mesh of [base, overlay]) {
        mesh.position.set(...placement[part].offset)
        pivot.add(mesh)
      }
      this.group.add(pivot)
      parts[part] = { pivot, base, overlay }
    }
    this.parts = parts
  }

  setModel(model: SkinModel): void {
    if (model === this.model) return
    this.disposeGeometry()
    this.model = model
    this.build(model)
  }

  /** Call after drawing on the source canvas. */
  refresh(): void {
    this.texture.needsUpdate = true
  }

  setVisible(visible: { base: boolean; overlay: boolean; parts: Record<Part, boolean> }): void {
    for (const part of PARTS) {
      this.parts[part].base.visible = visible.base && visible.parts[part]
      this.parts[part].overlay.visible = visible.overlay && visible.parts[part]
    }
  }

  meshes(layer?: Layer): THREE.Mesh[] {
    return PARTS.flatMap((p) => (layer ? [this.parts[p][layer]] : [this.parts[p].base, this.parts[p].overlay]))
  }

  resetPose(): void {
    for (const part of PARTS) this.parts[part].pivot.rotation.set(0, 0, 0)
  }

  /** Strike the pose of an animation `t` seconds in. */
  pose(animation: Animation, t: number): void {
    const p = this.parts
    this.resetPose()
    if (animation === 'walk') {
      const swing = Math.sin(t * 6)
      p.rightLeg.pivot.rotation.x = swing * 0.6
      p.leftLeg.pivot.rotation.x = -swing * 0.6
      p.rightArm.pivot.rotation.x = -swing * 0.5
      p.leftArm.pivot.rotation.x = swing * 0.5
      p.head.pivot.rotation.y = Math.sin(t * 1.5) * 0.15
    } else if (animation === 'idle') {
      const breath = Math.sin(t * 1.6)
      p.rightArm.pivot.rotation.z = -0.04 - breath * 0.03
      p.leftArm.pivot.rotation.z = 0.04 + breath * 0.03
      p.head.pivot.rotation.y = Math.sin(t * 0.7) * 0.25
      p.head.pivot.rotation.x = Math.sin(t * 0.5) * 0.06
    }
  }

  private disposeGeometry(): void {
    for (const mesh of this.meshes()) mesh.geometry.dispose()
  }

  dispose(): void {
    this.disposeGeometry()
    this.baseMaterial.dispose()
    this.overlayMaterial.dispose()
    this.texture.dispose()
  }
}

export type Animation = 'none' | 'idle' | 'walk'

export interface PixelHit {
  /** Texture pixel index (y * 64 + x). */
  index: number
  part: Part
  layer: Layer
}

/**
 * A rendered player in a container element. It only draws when something changes (or while an animation or camera
 * glide runs), so an idle viewer costs nothing.
 */
export class PlayerScene {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(32, 1, 1, 400)
  readonly controls: OrbitControls
  readonly player: PlayerModel
  animation: Animation = 'none'
  private frame = 0
  private readonly started = performance.now()
  private readonly resize: ResizeObserver
  private readonly raycaster = new THREE.Raycaster()

  constructor(
    private readonly container: HTMLElement,
    source: HTMLCanvasElement,
    model: SkinModel
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(this.renderer.domElement)
    this.player = new PlayerModel(source, model)
    this.scene.add(this.player.group)
    this.camera.position.set(30, 28, 74)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(0, 16, 0)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.12
    this.controls.minDistance = 22
    this.controls.maxDistance = 140
    this.controls.enablePan = true
    this.controls.screenSpacePanning = true
    this.controls.addEventListener('change', () => this.invalidate())
    this.controls.update()
    this.resize = new ResizeObserver(() => this.fit())
    this.resize.observe(container)
    this.fit()
  }

  private fit(): void {
    const { clientWidth: w, clientHeight: h } = this.container
    if (!w || !h) return
    this.renderer.setSize(w, h, false)
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.invalidate()
  }

  setAnimation(animation: Animation): void {
    this.animation = animation
    if (animation === 'none') this.player.resetPose()
    this.invalidate()
  }

  /** Ask for a redraw on the next frame (repeated while animating or while the camera glides to a stop). */
  invalidate(): void {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      if (this.animation !== 'none') this.player.pose(this.animation, (performance.now() - this.started) / 1000)
      const moving = this.controls.update()
      this.renderer.render(this.scene, this.camera)
      if (this.animation !== 'none' || moving) this.invalidate()
    })
  }

  /** The texture pixel under a point on screen, on the visible meshes of `layer`. */
  pick(clientX: number, clientY: number, layer: Layer): PixelHit | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(pointer, this.camera)
    const targets = this.player.meshes(layer).filter((m) => m.visible)
    const hit = this.raycaster.intersectObjects(targets, false)[0]
    if (!hit?.uv || hit.faceIndex == null) return null
    const { part } = hit.object.userData as { part: Part }
    // Clamp to the face that was hit, so a ray grazing an edge never lands on a neighbouring area of the texture.
    const face = skinLayout(this.player.model).find(part, layer, BOX_FACES[Math.floor(hit.faceIndex / 2)])
    const x = Math.min(face.x + face.w - 1, Math.max(face.x, Math.floor(hit.uv.x * SKIN_SIZE)))
    const y = Math.min(face.y + face.h - 1, Math.max(face.y, Math.floor((1 - hit.uv.y) * SKIN_SIZE)))
    return { index: y * SKIN_SIZE + x, part, layer }
  }

  /** A PNG of the current view. */
  screenshot(): string {
    this.renderer.render(this.scene, this.camera)
    return this.renderer.domElement.toDataURL('image/png')
  }

  dispose(): void {
    cancelAnimationFrame(this.frame)
    this.resize.disconnect()
    this.controls.dispose()
    this.player.dispose()
    this.renderer.dispose()
    // Free the WebGL context now rather than at garbage collection: browsers only allow a few at a time.
    this.renderer.forceContextLoss()
    this.renderer.domElement.remove()
  }
}
