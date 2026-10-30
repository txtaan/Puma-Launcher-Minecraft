import { useState } from 'react'
import type { SkinEntry, SkinModel } from '@shared/types'
import { api, errorMessage } from '../api'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { useStore } from '../store'

/**
 * How to show a skin to the other players on a server. Offline accounts and "cracked" servers get no skins from
 * Mojang, so the server needs a skin mod or plugin, and the player gives it the skin once with a command.
 */
export function ServerSkinDialog({ skin, onClose }: { skin: SkinEntry; onClose: () => void }) {
  const { t, toast } = useStore()
  const [link, setLink] = useState<{ url: string; model: SkinModel } | null>(null)
  const [busy, setBusy] = useState(false)

  const make = async () => {
    setBusy(true)
    try {
      setLink(await api.skins.serverLink(skin.id))
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }
  const copy = async (text: string) => {
    await api.copy(text)
    toast(t('skins.server.copied'), 'success')
  }
  const commands = link
    ? [
        { label: t('skins.server.mod'), text: `/skin set web ${link.model} "${link.url}"` },
        { label: t('skins.server.plugin'), text: `/skin ${link.url}` }
      ]
    : []

  return (
    <Modal title={t('skins.server.title', { name: skin.name })} onClose={onClose}>
      <div className="stack server-skin">
        <p className="muted">{t('skins.server.why')}</p>
        <ol className="server-steps">
          <li>{t('skins.server.step1')}</li>
          <li>
            <p>{t('skins.server.step2')}</p>
            {link ? (
              commands.map((c) => (
                <div key={c.label} className="server-command">
                  <span className="muted small">{c.label}</span>
                  <code>{c.text}</code>
                  <button className="icon-btn" title={t('skins.server.copy')} aria-label={t('skins.server.copy')} onClick={() => void copy(c.text)}>
                    <Icon name="copy" size={16} />
                  </button>
                </div>
              ))
            ) : (
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void make()}>
                {busy ? <span className="spinner sm" /> : <Icon name="server" size={14} />} {busy ? t('skins.server.making') : t('skins.server.make')}
              </button>
            )}
          </li>
          <li>{t('skins.server.step3')}</li>
        </ol>
        <p className="muted small">{t('skins.server.friends')}</p>
        <div className="row gap-s end">
          <button className="btn btn-ghost" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
