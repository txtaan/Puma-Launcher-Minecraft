import type { MessageKey } from '@shared/i18n'
import { useStore, type Page } from '../store'
import { Avatar } from './Avatar'
import { Icon } from './Icon'

const NAV: { page: Page; label: MessageKey; icon: string }[] = [
  { page: 'home', label: 'nav.home', icon: 'home' },
  { page: 'instances', label: 'nav.instances', icon: 'grid' },
  { page: 'skins', label: 'nav.skins', icon: 'shirt' },
  { page: 'settings', label: 'nav.settings', icon: 'settings' }
]

/** The nav item a page belongs to: Java and Versions open from Settings → Advanced. */
const navPage = (page: Page): Page => (page === 'java' || page === 'versions' ? 'settings' : page)

export function Sidebar() {
  const { page, setPage, account, selectAccount, t, update, installUpdate, instances } = useStore()
  const readyVersion = update && update.state.status === 'ready' ? update.state.version : null
  const gameRunning = instances.some((i) => i.running)
  return (
    <nav className="sidebar">
      <div className="nav">
        {NAV.map((n) => {
          const active = navPage(page) === n.page
          return (
            <button
              key={n.page}
              className={`nav-item ${active ? 'active' : ''}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => setPage(n.page)}
            >
              <Icon name={n.icon} />
              <span>{t(n.label)}</span>
            </button>
          )
        })}
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
              {account.type !== 'offline' && <span>{account.type === 'microsoft' ? t('account.microsoft') : account.serverName}</span>}
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
