import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { StoreProvider } from './store'
import './theme'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import './styles/theme.css'
import './styles/app.css'
import './styles/skins.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>
)
