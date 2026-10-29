import { app } from 'electron'
import { resolveLanguage, translate, type Language, type LanguagePreference, type MessageKey } from '@shared/i18n'

// Language for text the main process produces: download titles, progress stages, errors and console lines.
let language: Language = 'en'

export function setLanguage(preference: LanguagePreference): void {
  language = resolveLanguage(preference, app.getLocale())
}

export function tr(key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(language, key, vars)
}

/** A duration as seconds with one decimal, written the way the current language writes numbers (1.5 / 1,5). */
export function seconds(ms: number): string {
  return (ms / 1000).toLocaleString(language === 'it' ? 'it-IT' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}
