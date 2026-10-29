import type { MessageKey } from '@shared/i18n'
import { useStore, type Page } from '../store'
import { Avatar } from './Avatar'
import { Icon } from './Icon'

const NAV: { page: Page; label: MessageKey; icon: string }[] = [
  { page: 'home', label: 'nav.home', icon: 'home' },
  { page: 'instances', label: 'nav.instances', icon: 'grid' },
  { page: 'versions', label: 'nav.versions', icon: 'layers' },
  { page: 'java', label: 'nav.java', icon: 'coffee' },
  { page: 'settings', label: 'nav.settings', icon: 'settings' }
]

export function Sidebar() {
  const { page, setPage, account, selectAccount, setConsoleOpen, consoleOpen, t, update, installUpdate, instances } = useStore()
  const readyVersion = update && update.state.status === 'ready' ? update.state.version : null
  const gameRunning = instances.some((i) => i.running)
  return (
    <nav className="sidebar">
      <div className="nav">
        {NAV.map((n) => (
          <button key={n.page} className={`nav-item ${page === n.page ? 'active' : ''}`} onClick={() => setPage(n.page)}>
            <Icon name={n.icon} />
            <span>{t(n.label)}</span>
          </button>
        ))}
        <button className={`nav-item ${consoleOpen ? 'active' : ''}`} onClick={() => setConsoleOpen(!consoleOpen)}>
          <Icon name="terminal" />
          <span>{t('nav.console')}</span>
        </button>
      </div>
      <div className="sidebar-foot">
        {readyVersion && (
          <button
            className="btn btn-primary w-full"
            disabled={gameRunning}
            title={t(gameRunning ? 'update.closeGame' : update?.method === 'restart' ? 'update.restartHint' : 'update.openHint')}
            onClick={() => void installUpdate()}
          >
            <Icon name="download" size={16} /> {t('update.button', { version: readyVersion })}
          </button>
        )}
        {account && (
          <div className="account-chip">
            <Avatar account={account} size={34} />
            <div className="account-meta">
              <strong>{account.username}</strong>
              <span>{account.type === 'microsoft' ? t('account.microsoft') : account.type === 'authlib' ? account.serverName : t('account.offline')}</span>
            </div>
            <button className="icon-btn" aria-label={t('nav.signOut')} title={t('nav.switchAccount')} onClick={() => void selectAccount(undefined)}>
              <Icon name="logout" />
            </button>
          </div>
        )}
      </div>
    </nav>
  )
}
