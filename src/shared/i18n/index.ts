import { en } from './en'
import { it } from './it'

export type Language = 'en' | 'it'
/** "system" follows the operating system's language (Italian systems get Italian, everything else English). */
export type LanguagePreference = 'system' | Language
export type MessageKey = keyof typeof en
export type Messages = Record<MessageKey, string>
export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string

const dictionaries: Record<Language, Messages> = { en, it }

export function resolveLanguage(preference: LanguagePreference | undefined, systemLocale: string): Language {
  if (preference === 'en' || preference === 'it') return preference
  return systemLocale.toLowerCase().startsWith('it') ? 'it' : 'en'
}

/** Looks up a message and fills its {placeholders}; placeholders without a value are left as they are. */
export function translate(language: Language, key: MessageKey, vars?: Record<string, string | number>): string {
  const text = dictionaries[language][key] ?? en[key]
  return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : text
}
