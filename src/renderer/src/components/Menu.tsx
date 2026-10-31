import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

export interface MenuItem {
  label: string
  icon?: string
  /** Shown in the danger colour, after a separator line. */
  danger?: boolean
  onSelect: () => void
}

/**
 * An icon button (by default "…") that opens a small menu of actions. The menu is drawn over the page, so a card's
 * rounded corners or the scrolling page can't cut it off: below the button, or above it when there's no room, and it
 * follows the button when the page scrolls. It closes on Escape, a click outside, or after choosing; arrow keys move
 * between its items.
 */
export function MenuButton({ label, icon = 'dots', items }: { label: string; icon?: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const id = useId()

  const close = (refocus: boolean) => {
    setOpen(false)
    setPos(null)
    if (refocus) button.current?.focus()
  }

  // The menu's size is known only once it's rendered, so it's placed after that.
  const place = () => {
    if (!button.current || !menu.current) return
    const b = button.current.getBoundingClientRect()
    const { offsetWidth: width, offsetHeight: height } = menu.current
    const below = b.bottom + 6 + height <= window.innerHeight - 8
    setPos({
      top: below ? b.bottom + 6 : Math.max(8, b.top - 6 - height),
      left: Math.min(Math.max(8, b.right - width), window.innerWidth - width - 8)
    })
  }
  useLayoutEffect(() => {
    if (open) place()
  }, [open])

  // Focus the first item as soon as the menu shows (a hidden menu can't take focus), but not again when it moves.
  const shown = pos !== null
  useEffect(() => {
    if (shown) menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
  }, [shown])

  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Only the menu closes, not a dialog it may sit in.
      e.stopPropagation()
      close(true)
    }
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node
      if (!menu.current?.contains(target) && !button.current?.contains(target)) close(false)
    }
    // Stay next to the button while the page scrolls or the window resizes, until the button goes out of sight.
    const follow = () => {
      const b = button.current?.getBoundingClientRect()
      if (!b || b.bottom < 0 || b.top > window.innerHeight) close(false)
      else place()
    }
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPointer, true)
    window.addEventListener('scroll', follow, true)
    window.addEventListener('resize', follow)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPointer, true)
      window.removeEventListener('scroll', follow, true)
      window.removeEventListener('resize', follow)
    }
  }, [open])

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    // Tab leaves the menu from its button, so focus moves on to whatever follows it on the page.
    if (e.key === 'Tab') return close(true)
    const entries = [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])]
    const at = entries.indexOf(document.activeElement as HTMLButtonElement)
    const moves: Record<string, number> = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: entries.length - 1 }
    if (!(e.key in moves)) return
    e.preventDefault()
    entries[(moves[e.key] + entries.length) % entries.length]?.focus()
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`icon-btn ${open ? 'active' : ''}`}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        <Icon name={icon} size={16} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id={id}
            className="menu"
            role="menu"
            aria-label={label}
            style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }}
            onKeyDown={onMenuKey}
          >
            {items.map((item) => (
              <Fragment key={item.label}>
                {item.danger && <div className="menu-sep" role="separator" />}
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  className={`menu-item ${item.danger ? 'danger' : ''}`}
                  onClick={() => {
                    close(true)
                    item.onSelect()
                  }}
                >
                  {item.icon && <Icon name={item.icon} size={16} />}
                  {item.label}
                </button>
              </Fragment>
            ))}
          </div>,
          document.body
        )}
    </>
  )
}
