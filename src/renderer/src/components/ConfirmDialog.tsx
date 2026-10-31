import { useId, useState } from 'react'
import { useStore } from '../store'
import { Modal } from './Modal'

/**
 * "Are you sure?" dialog. For a `danger` action (deleting, discarding) the safe button has the focus, so pressing
 * Enter straight away doesn't destroy anything. Focus goes back to where it was when the dialog closes.
 */
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
  /** Defaults to "Cancel". */
  cancel?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const { t } = useStore()
  const textId = useId()
  // Read while rendering, before the dialog's own button takes the focus.
  const [opener] = useState(() => document.activeElement)
  const close = () => {
    onClose()
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
  }
  return (
    <Modal title={title} onClose={close} describedBy={textId}>
      <p id={textId} className="muted confirm-text">
        {text}
      </p>
      <div className="row gap-s end" style={{ marginTop: 20 }}>
        <button className="btn btn-ghost" autoFocus={danger} onClick={close}>
          {cancel ?? t('common.cancel')}
        </button>
        <button
          className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
          autoFocus={!danger}
          onClick={() => {
            close()
            onConfirm()
          }}
        >
          {confirm}
        </button>
      </div>
    </Modal>
  )
}
