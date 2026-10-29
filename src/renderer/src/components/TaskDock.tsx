import { useStore } from '../store'

/** Floating panel listing running downloads/launches with progress bars. */
export function TaskDock() {
  const { tasks, t } = useStore()
  const list = Object.values(tasks)
  if (!list.length) return null
  return (
    <div className="task-dock">
      {list.map((task) => {
        const pct = task.total ? Math.round((task.done / task.total) * 100) : 0
        return (
          <div key={task.taskId} className={`task ${task.error ? 'task-error' : ''}`}>
            <div className="task-head">
              <strong>{task.title}</strong>
              <span>{task.finished ? (task.error ? t('task.failed') : t('task.done')) : task.total > 1 ? `${pct}%` : ''}</span>
            </div>
            <div className="task-stage">
              {task.stage}
              {task.total > 1 && !task.finished ? ` · ${task.done}/${task.total}` : ''}
            </div>
            <div className="progress">
              <div className="progress-bar" style={{ width: `${task.finished ? 100 : pct}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
