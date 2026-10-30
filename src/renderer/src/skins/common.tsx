import { useState } from 'react'
import type { MessageKey } from '@shared/i18n'
import type { RawSkin, SkinEntry, SkinModel } from '@shared/types'
import { api, errorMessage } from '../api'
import { Modal } from '../components/Modal'
import { useStore } from '../store'
import { pixelsToPng, prepareSkin, SkinImageError } from './image'
import type { Part } from './layout'
import { templatePixels, type TemplateId } from './templates'
import { useThumbnail } from './thumbnails'

export const PART_LABEL: Record<Part, MessageKey> = {
  head: 'skins.part.head',
  body: 'skins.part.body',
  rightArm: 'skins.part.rightArm',
  leftArm: 'skins.part.leftArm',
  rightLeg: 'skins.part.rightLeg',
  leftLeg: 'skins.part.leftLeg'
}
/** Colour dots that tell the parts apart in tables and chips. */
export const PART_COLOR: Record<Part, string> = {
  head: '#e5a43d',
  body: '#5485a7',
  rightArm: '#4fb286',
  leftArm: '#8fd6ae',
  rightLeg: '#8f7ad8',
  leftLeg: '#bdb0f0'
}
export const MODEL_LABEL: Record<SkinModel, MessageKey> = { classic: 'skins.model.classic', slim: 'skins.model.slim' }
export const SOURCE_LABEL: Record<SkinEntry['source'], MessageKey> = {
  created: 'skins.source.created',
  imported: 'skins.source.imported',
  username: 'skins.source.username'
}

const templates = new Map<TemplateId, Pick<SkinEntry, 'id' | 'png' | 'model' | 'updatedAt'>>()

/** A template as a (classic) skin, for previews. */
export function templateSkin(id: TemplateId): Pick<SkinEntry, 'id' | 'png' | 'model' | 'updatedAt'> {
  let skin = templates.get(id)
  if (!skin) {
    skin = { id: `template:${id}`, png: pixelsToPng(templatePixels(id, 'classic')), model: 'classic', updatedAt: 0 }
    templates.set(id, skin)
  }
  return skin
}

/** The skin's face with its hat layer, straight from the texture (no canvas work). */
export function SkinFace({ png, size = 36, className }: { png: string; size?: number; className?: string }) {
  const unit = size / 8
  return (
    <span
      className={`skin-face ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${png}), url(${png})`,
        backgroundSize: `${unit * 64}px ${unit * 64}px`,
        backgroundPosition: `${-unit * 40}px ${-unit * 8}px, ${-unit * 8}px ${-unit * 8}px`
      }}
      aria-hidden
    />
  )
}

/** The three-quarter render of a skin, with a placeholder while it is drawn. */
export function SkinThumb({ skin, className }: { skin: Pick<SkinEntry, 'id' | 'png' | 'model' | 'updatedAt'>; className?: string }) {
  const thumb = useThumbnail(skin)
  return thumb ? <img className={`skin-thumb ${className ?? ''}`} src={thumb.url} alt="" draggable={false} /> : <span className={`skin-thumb placeholder ${className ?? ''}`} />
}

const readFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

/** Everything the Skins screens do to the library, with the toasts that report it. */
export function useSkinActions() {
  const { account, skins, setSkins, refreshSkins, toast, t } = useStore()
  const [busy, setBusy] = useState<string | null>(null)
  const wornId = account && skins ? skins.equipped[account.id] : undefined

  async function attempt<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn()
    } catch (err) {
      toast(errorMessage(err), 'error')
      return undefined
    }
  }

  async function importRaw(raws: RawSkin[], source: SkinEntry['source']): Promise<SkinEntry[]> {
    const saved: SkinEntry[] = []
    for (const raw of raws) {
      try {
        saved.push(await api.skins.save({ name: raw.name, ...(await prepareSkin(raw)), source }))
      } catch (err) {
        toast(err instanceof SkinImageError ? t('skins.notASkin', { name: raw.name }) : errorMessage(err), 'error')
      }
    }
    if (saved.length) {
      await refreshSkins()
      toast(saved.length === 1 ? t('skins.importedOne', { name: saved[0].name }) : t('skins.imported', { count: saved.length }), 'success')
    }
    return saved
  }

  return {
    busy,
    wornId,
    importRaw,
    importFiles: async (files: File[]) => {
      const pngs = files.filter((f) => f.type === 'image/png' || f.name.toLowerCase().endsWith('.png'))
      for (const f of files) if (!pngs.includes(f)) toast(t('skins.notASkin', { name: f.name }), 'error')
      const raws = await Promise.all(pngs.map(async (f) => ({ name: f.name.replace(/\.png$/i, ''), png: await readFile(f) })))
      return importRaw(raws, 'imported')
    },
    pickFiles: async () => importRaw((await attempt(() => api.skins.openFiles())) ?? [], 'imported'),
    fromUsername: async (name: string) => {
      const raw = await attempt(() => api.skins.fromUsername(name))
      return raw ? importRaw([raw], 'username') : []
    },
    /** Wear a skin with the signed-in account, or go back to the default skin with null. */
    equip: async (skin: SkinEntry | null) => {
      if (!account) return
      setBusy(skin?.id ?? wornId ?? null)
      await attempt(async () => {
        setSkins(await api.skins.equip(account.id, skin?.id ?? null))
        if (!skin) toast(t('skins.unequipped'), 'success')
        else toast(t(account.type === 'microsoft' ? 'skins.equippedMicrosoft' : 'skins.equipped', { name: skin.name }), 'success')
      })
      setBusy(null)
    },
    toggleFavorite: async (skin: SkinEntry) => {
      if (skins) setSkins({ ...skins, skins: skins.skins.map((s) => (s.id === skin.id ? { ...s, favorite: !skin.favorite } : s)) })
      await attempt(() => api.skins.setFavorite(skin.id, !skin.favorite))
    },
    remove: async (skin: SkinEntry) => {
      await attempt(async () => {
        await api.skins.remove(skin.id)
        await refreshSkins()
        toast(t('skins.deleted', { name: skin.name }), 'success')
      })
    },
    duplicate: async (skin: SkinEntry) =>
      attempt(async () => {
        const copy = await api.skins.save({ name: t('skins.copyOf', { name: skin.name }), model: skin.model, png: skin.png, alternate: skin.alternate, source: skin.source })
        await refreshSkins()
        return copy
      }),
    rename: async (skin: SkinEntry, name: string) =>
      attempt(async () => {
        await api.skins.save({ id: skin.id, name, model: skin.model, png: skin.png, alternate: skin.alternate })
        await refreshSkins()
      }),
    exportPng: async (name: string, png: string) => {
      const path = await attempt(() => api.skins.exportPng(name, png))
      if (path) toast(t('skins.savedTo', { path }), 'success')
    }
  }
}

export function RenameDialog({ skin, onClose, onRename }: { skin: SkinEntry; onClose: () => void; onRename: (name: string) => void }) {
  const { t } = useStore()
  const [name, setName] = useState(skin.name)
  return (
    <Modal title={t('skins.renameTitle')} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          onRename(name)
          onClose()
        }}
      >
        <label className="field">
          <span>{t('common.name')}</span>
          <input autoFocus maxLength={48} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="row gap-s end">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
            {t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function ConfirmDialog({
  title,
  text,
  confirm,
  cancel,
  danger,
  onConfirm,
  onClose
}: {
  title: string
  text: string
  confirm: string
  cancel: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted">{text}</p>
      <div className="row gap-s end" style={{ marginTop: 20 }}>
        <button className="btn btn-ghost" onClick={onClose}>
          {cancel}
        </button>
        <button
          className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
          autoFocus
          onClick={() => {
            onClose()
            onConfirm()
          }}
        >
          {confirm}
        </button>
      </div>
    </Modal>
  )
}
