import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { Icon } from './Icon'

export function Console() {
  const { logs, consoleOpen, setConsoleOpen, clearLogs, t } = useStore()
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Braces matter: scrollIntoView() returns a Promise in recent Chromium, which React would treat as a cleanup function.
    void end.current?.scrollIntoView({ block: 'end' })
  }, [logs.length, consoleOpen])
  if (!consoleOpen) return null
  return (
    <section className="console">
      <div className="console-head">
        <strong>{t('console.title')}</strong>
        <div className="row gap-s">
          <button className="btn btn-ghost btn-sm" onClick={clearLogs}>
            {t('console.clear')}
          </button>
          <button className="icon-btn" aria-label={t('console.close')} onClick={() => setConsoleOpen(false)}>
            <Icon name="x" />
          </button>
        </div>
      </div>
      <div className="console-body">
        {logs.length === 0 && <div className="muted">{t('console.empty')}</div>}
        {logs.map((l, i) => (
          <div key={i} className={`log log-${l.stream} ${/\b(ERROR|FATAL|Exception)\b/.test(l.line) ? 'log-err' : /\bWARN\b/.test(l.line) ? 'log-warn' : ''}`}>
            {l.line}
          </div>
        ))}
        <div ref={end} />
      </div>
    </section>
  )
}
