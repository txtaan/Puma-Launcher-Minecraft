import { useStore } from '../store'

export function Toasts() {
  const { toasts } = useStore()
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}
