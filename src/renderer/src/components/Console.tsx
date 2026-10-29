import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { Icon } from './Icon'

export function Console() {
  const { logs, consoleOpen, setConsoleOpen, clearLogs } = useStore()
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Braces matter: scrollIntoView() returns a Promise in recent Chromium, which React would treat as a cleanup function.
    void end.current?.scrollIntoView({ block: 'end' })
  }, [logs.length, consoleOpen])
  if (!consoleOpen) return null
  return (
    <section className="console">
      <div className="console-head">
        <strong>Game console</strong>
        <div className="row gap-s">
          <button className="btn btn-ghost btn-sm" onClick={clearLogs}>
            Clear
          </button>
          <button className="icon-btn" aria-label="Close console" onClick={() => setConsoleOpen(false)}>
            <Icon name="x" />
          </button>
        </div>
      </div>
      <div className="console-body">
        {logs.length === 0 && <div className="muted">No output yet. Launch a game to see its log here.</div>}
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
