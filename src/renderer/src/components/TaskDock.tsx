import { useStore } from '../store'

/** Floating panel listing running downloads/launches with progress bars. */
export function TaskDock() {
  const { tasks } = useStore()
  const list = Object.values(tasks)
  if (!list.length) return null
  return (
    <div className="task-dock">
      {list.map((t) => {
        const pct = t.total ? Math.round((t.done / t.total) * 100) : 0
        return (
          <div key={t.taskId} className={`task ${t.error ? 'task-error' : ''}`}>
            <div className="task-head">
              <strong>{t.title}</strong>
              <span>{t.finished ? (t.error ? 'Failed' : 'Done') : t.total > 1 ? `${pct}%` : ''}</span>
            </div>
            <div className="task-stage">
              {t.stage}
              {t.total > 1 && !t.finished ? ` · ${t.done}/${t.total}` : ''}
            </div>
            <div className="progress">
              <div className="progress-bar" style={{ width: `${t.finished ? 100 : pct}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
