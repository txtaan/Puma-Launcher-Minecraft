import { api } from '../api'
import { Icon } from './Icon'

export function TitleBar() {
  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <span className="brand-mark" />
        Txtaan Launcher
      </div>
      <div className="titlebar-controls">
        <button aria-label="Minimize" onClick={api.window.minimize}>
          <Icon name="min" size={14} />
        </button>
        <button aria-label="Maximize" onClick={api.window.maximize}>
          <Icon name="max" size={12} />
        </button>
        <button aria-label="Close" className="close" onClick={api.window.close}>
          <Icon name="x" size={14} />
        </button>
      </div>
    </header>
  )
}
