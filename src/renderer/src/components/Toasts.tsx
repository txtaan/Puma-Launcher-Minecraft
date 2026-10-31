import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'

type Box = { left: number; right: number; top: number; bottom: number }
const overlaps = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

/**
 * Toasts never get in the way: clicks go through them (see .toast in app.css), and one fades out while the mouse or
 * keyboard focus is on what it covers.
 */
export function Toasts() {
  const { toasts } = useStore()
  const stack = useRef<HTMLDivElement>(null)
  const pointer = useRef<Box | null>(null)
  const [aside, setAside] = useState<string[]>([])

  useEffect(() => {
    if (!toasts.length) return
    const check = () => {
      // Keyboard focus only: a mouse click also focuses what it clicked, and the pointer already covers that.
      const focused = document.activeElement
      const focus = focused?.matches(':focus-visible') ? focused.getBoundingClientRect() : null
      const ids = [...(stack.current?.querySelectorAll<HTMLElement>('.toast') ?? [])]
        .filter((el) => {
          const box = el.getBoundingClientRect()
          return (pointer.current && overlaps(pointer.current, box)) || (focus && overlaps(focus, box))
        })
        .map((el) => el.dataset.id!)
      setAside((prev) => (prev.join() === ids.join() ? prev : ids))
    }
    const onMove = (e: PointerEvent) => {
      pointer.current = { left: e.clientX, right: e.clientX + 1, top: e.clientY, bottom: e.clientY + 1 }
      check()
    }
    check()
    window.addEventListener('pointermove', onMove)
    window.addEventListener('focusin', check)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('focusin', check)
    }
  }, [toasts])

  return (
    <div ref={stack} className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} data-id={t.id} className={`toast toast-${t.kind} ${aside.includes(String(t.id)) ? 'toast-aside' : ''}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}
