import { api } from '../api'
import { useStore } from '../store'
import { Icon } from './Icon'

export function TitleBar() {
  const { t } = useStore()
  const mac = api.platform === 'darwin'
  return (
    <header className={`titlebar ${mac ? 'titlebar-mac' : ''}`}>
      <div className="titlebar-brand">
        <span className="brand-mark" />
        Puma Launcher
      </div>
      {!mac && (
        <div className="titlebar-controls">
          <button aria-label={t('window.minimize')} onClick={api.window.minimize}>
            <Icon name="min" size={14} />
          </button>
          <button aria-label={t('window.maximize')} onClick={api.window.maximize}>
            <Icon name="max" size={12} />
          </button>
          <button aria-label={t('common.close')} className="close" onClick={api.window.close}>
            <Icon name="x" size={14} />
          </button>
        </div>
      )}
    </header>
  )
}
