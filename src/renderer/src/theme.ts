import type { ThemePreference } from '@shared/types'

// Resolves the theme preference to <html data-theme="light|dark">, which theme.css keys its colours on.
// Until settings load the OS preference is used; in Electron that already reflects the saved choice,
// because the main process sets nativeTheme.themeSource before the window opens.
const prefersLight = window.matchMedia('(prefers-color-scheme: light)')
let preference: ThemePreference = 'system'

function apply(): void {
  const theme = preference === 'system' ? (prefersLight.matches ? 'light' : 'dark') : preference
  document.documentElement.dataset.theme = theme
}

export function setThemePreference(p: ThemePreference): void {
  preference = p
  apply()
}

prefersLight.addEventListener('change', apply)
apply()
