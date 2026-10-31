import { useEffect, useLayoutEffect, useRef } from 'react'
import { Console } from './components/Console'
import { Sidebar } from './components/Sidebar'
import { TaskDock } from './components/TaskDock'
import { TitleBar } from './components/TitleBar'
import { Toasts } from './components/Toasts'
import { Home } from './pages/Home'
import { Instances } from './pages/Instances'
import { Java } from './pages/Java'
import { Login } from './pages/Login'
import { SettingsPage } from './pages/Settings'
import { Skins } from './pages/Skins'
import { Versions } from './pages/Versions'
import { useStore } from './store'

export function App() {
  const { ready, account, page } = useStore()
  // Every page scrolls in the same container: start each one at the top, not where the last page was left.
  // A layout effect, so it runs before a page's own effects (Settings scrolls back to Advanced from Java/Versions).
  const content = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    void content.current?.scrollTo(0, 0)
  }, [page])
  // A file dropped outside a drop zone would otherwise replace the launcher with that file.
  useEffect(() => {
    const block = (e: DragEvent) => e.preventDefault()
    window.addEventListener('dragover', block)
    window.addEventListener('drop', block)
    return () => {
      window.removeEventListener('dragover', block)
      window.removeEventListener('drop', block)
    }
  }, [])
  return (
    <div className="app">
      <TitleBar />
      {!ready ? (
        <div className="splash">
          <span className="spinner" />
        </div>
      ) : !account ? (
        <Login />
      ) : (
        <div className="shell">
          <Sidebar />
          <main ref={content} className="content">
            {page === 'home' && <Home />}
            {page === 'instances' && <Instances />}
            {page === 'versions' && <Versions />}
            {page === 'java' && <Java />}
            {page === 'skins' && <Skins />}
            {page === 'settings' && <SettingsPage />}
            <Console />
          </main>
        </div>
      )}
      <TaskDock />
      <Toasts />
    </div>
  )
}
