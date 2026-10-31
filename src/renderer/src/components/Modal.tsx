import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useStore } from '../store'
import { Icon } from './Icon'

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

/**
 * A dialog over the page. Keyboard focus moves into it (unless a field in it takes it with autoFocus), Tab cycles
 * inside it, and focus goes back to where it was when it closes.
 */
export function Modal({
  title,
  onClose,
  children,
  wide,
  describedBy
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
  /** Id of the text that explains the dialog, for screen readers. */
  describedBy?: string
}) {
  const { t } = useStore()
  const box = useRef<HTMLDivElement>(null)
  // Read while rendering, before a field in the dialog takes the focus.
  const [opener] = useState(() => document.activeElement)

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!box.current?.contains(document.activeElement)) box.current?.focus()
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [opener])

  const trapTab = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !box.current) return
    const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0)
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    const at = document.activeElement
    if (e.shiftKey && (at === first || at === box.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && at === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={box}
        className={`modal ${wide ? 'modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-describedby={describedBy}
        tabIndex={-1}
        onKeyDown={trapTab}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label={t('common.close')} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
