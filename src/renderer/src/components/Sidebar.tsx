import { useStore, type Page } from '../store'
import { Avatar } from './Avatar'
import { Icon } from './Icon'

const NAV: { page: Page; label: string; icon: string }[] = [
  { page: 'home', label: 'Home', icon: 'home' },
  { page: 'instances', label: 'Instances', icon: 'grid' },
  { page: 'versions', label: 'Versions', icon: 'layers' },
  { page: 'java', label: 'Java', icon: 'coffee' },
  { page: 'settings', label: 'Settings', icon: 'settings' }
]

export function Sidebar() {
  const { page, setPage, account, selectAccount, setConsoleOpen, consoleOpen } = useStore()
  return (
    <nav className="sidebar">
      <div className="nav">
        {NAV.map((n) => (
          <button key={n.page} className={`nav-item ${page === n.page ? 'active' : ''}`} onClick={() => setPage(n.page)}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </button>
        ))}
        <button className={`nav-item ${consoleOpen ? 'active' : ''}`} onClick={() => setConsoleOpen(!consoleOpen)}>
          <Icon name="terminal" />
          <span>Console</span>
        </button>
      </div>
      {account && (
        <div className="account-chip">
          <Avatar account={account} size={34} />
          <div className="account-meta">
            <strong>{account.username}</strong>
            <span>{account.type === 'microsoft' ? 'Microsoft' : 'Offline'}</span>
          </div>
          <button className="icon-btn" aria-label="Sign out" title="Switch account" onClick={() => void selectAccount(undefined)}>
            <Icon name="logout" />
          </button>
        </div>
      )}
    </nav>
  )
}
