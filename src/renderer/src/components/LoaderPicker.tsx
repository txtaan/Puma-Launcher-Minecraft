import { useEffect, useState } from 'react'
import type { Instance, LoaderType, LoaderVersion } from '@shared/types'
import { api, errorMessage } from '../api'
import { useStore } from '../store'

export const LOADERS: { key: LoaderType; label: string }[] = [
  { key: 'vanilla', label: 'Vanilla' },
  { key: 'fabric', label: 'Fabric' },
  { key: 'forge', label: 'Forge' },
  { key: 'neoforge', label: 'NeoForge' },
  { key: 'quilt', label: 'Quilt' }
]

export type ModLoaderType = Exclude<LoaderType, 'vanilla'>

export function loaderLabel(loader: Instance['loader']): string {
  if (!loader) return 'Vanilla'
  return LOADERS.find((l) => l.key === loader.type)?.label ?? loader.type
}

const LAST_LOADER = 'puma.lastLoader'

/** The mod loader the player chose last time (for a new instance, or added in the Mods window), if any. */
export function rememberedLoader(): ModLoaderType | undefined {
  try {
    const saved = localStorage.getItem(LAST_LOADER)
    return LOADERS.find((l) => l.key !== 'vanilla' && l.key === saved)?.key as ModLoaderType | undefined
  } catch {
    return undefined
  }
}

export function rememberLoader(type: ModLoaderType): void {
  try {
    localStorage.setItem(LAST_LOADER, type)
  } catch {
    // No storage (e.g. disabled): the next dialog just starts from Fabric.
  }
}

/**
 * Mod loader + loader version selector. Versions come from Prism Launcher's metadata,
 * filtered to the ones that support the chosen Minecraft version.
 */
export function LoaderPicker({
  mcVersion,
  value,
  onChange,
  allowVanilla = true,
  describe = false,
  label,
  vanillaLabel
}: {
  mcVersion: string
  value: Instance['loader']
  onChange: (loader: Instance['loader'] | undefined, ready: boolean) => void
  /** false where the player has already said they want mods: only the loaders are offered. */
  allowVanilla?: boolean
  /** Show a one-line description of the chosen loader under the choices. */
  describe?: boolean
  /** Replaces the "Mod loader" title. */
  label?: string
  /** Replaces "Vanilla" on the no-loader choice (e.g. "No" under "Does the server use mods?"). */
  vanillaLabel?: string
}) {
  const { t } = useStore()
  const type: LoaderType = value?.type ?? 'vanilla'
  const [versions, setVersions] = useState<LoaderVersion[] | null>(null)
  const [error, setError] = useState('')
  const [showUnstable, setShowUnstable] = useState(false)

  useEffect(() => {
    if (type === 'vanilla') {
      setVersions(null)
      onChange(undefined, true)
      return
    }
    // No Minecraft version picked yet: keep the loader, but there's nothing to look up.
    if (!mcVersion) {
      setVersions(null)
      onChange(value, false)
      return
    }
    let cancelled = false
    setVersions(null)
    setError('')
    onChange(value, false)
    api.loaders
      .versions(type, mcVersion)
      .then((list) => {
        if (cancelled) return
        setVersions(list)
        const keep = list.find((v) => v.version === value?.version)
        const pick = keep ?? list.find((v) => v.recommended) ?? list.find((v) => v.stable) ?? list[0]
        onChange(pick ? { type, version: pick.version } : value, !!pick)
      })
      .catch((err) => !cancelled && setError(errorMessage(err)))
    return () => {
      cancelled = true
    }
    // Re-run only when the loader type or Minecraft version changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, mcVersion])

  const shown = versions?.filter((v) => showUnstable || v.stable || v.recommended || v.version === value?.version) ?? []

  return (
    <div className="field">
      <span>{label ?? t('loader.title')}</span>
      <div className="segmented self-start">
        {LOADERS.filter((l) => allowVanilla || l.key !== 'vanilla').map((l) => (
          <button
            key={l.key}
            type="button"
            className={type === l.key ? 'active' : ''}
            aria-pressed={type === l.key}
            onClick={() => onChange(l.key === 'vanilla' ? undefined : { type: l.key, version: '' }, l.key === 'vanilla')}
          >
            {l.key === 'vanilla' && vanillaLabel ? vanillaLabel : l.label}
          </button>
        ))}
      </div>
      {describe && type !== 'vanilla' && <p className="loader-about">{t(`loader.about.${type}`)}</p>}
      {type !== 'vanilla' && mcVersion && (
        <div className="loader-version">
          {error && <div className="error-box">{error}</div>}
          {!versions && !error && (
            <span className="muted">
              <span className="spinner sm" /> {t('loader.loading', { loader: loaderLabel(value) })}
            </span>
          )}
          {versions && versions.length === 0 && (
            <span className="muted">{t('loader.unavailable', { loader: loaderLabel(value), version: mcVersion })}</span>
          )}
          {versions && versions.length > 0 && (
            <div className="row gap-s">
              <select
                className="grow"
                aria-label={t('loader.version')}
                value={value?.version}
                onChange={(e) => onChange({ type: type as ModLoaderType, version: e.target.value }, true)}
              >
                {shown.map((v) => (
                  <option key={v.version} value={v.version}>
                    {v.version}
                    {v.recommended ? ` ${t('loader.recommended')}` : !v.stable ? ` ${t('loader.beta')}` : ''}
                  </option>
                ))}
              </select>
              <label className="check">
                <input type="checkbox" checked={showUnstable} onChange={(e) => setShowUnstable(e.target.checked)} /> {t('loader.showBetas')}
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
