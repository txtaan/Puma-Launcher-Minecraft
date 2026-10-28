import { useEffect, useState } from 'react'
import type { Instance, LoaderType, LoaderVersion } from '@shared/types'
import { api, errorMessage } from '../api'

export const LOADERS: { key: LoaderType; label: string }[] = [
  { key: 'vanilla', label: 'Vanilla' },
  { key: 'fabric', label: 'Fabric' },
  { key: 'quilt', label: 'Quilt' },
  { key: 'forge', label: 'Forge' },
  { key: 'neoforge', label: 'NeoForge' }
]

export function loaderLabel(loader: Instance['loader']): string {
  if (!loader) return 'Vanilla'
  return LOADERS.find((l) => l.key === loader.type)?.label ?? loader.type
}

/**
 * Mod loader + loader version selector. Versions come from Prism Launcher's metadata,
 * filtered to the ones that support the chosen Minecraft version.
 */
export function LoaderPicker({
  mcVersion,
  value,
  onChange
}: {
  mcVersion: string
  value: Instance['loader']
  onChange: (loader: Instance['loader'] | undefined, ready: boolean) => void
}) {
  const type: LoaderType = value?.type ?? 'vanilla'
  const [versions, setVersions] = useState<LoaderVersion[] | null>(null)
  const [error, setError] = useState('')
  const [showUnstable, setShowUnstable] = useState(false)

  useEffect(() => {
    if (type === 'vanilla' || !mcVersion) {
      setVersions(null)
      onChange(undefined, true)
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
      <span>Mod loader</span>
      <div className="segmented">
        {LOADERS.map((l) => (
          <button
            key={l.key}
            type="button"
            className={type === l.key ? 'active' : ''}
            onClick={() => onChange(l.key === 'vanilla' ? undefined : { type: l.key, version: '' }, l.key === 'vanilla')}
          >
            {l.label}
          </button>
        ))}
      </div>
      {type !== 'vanilla' && (
        <div className="loader-version">
          {error && <div className="error-box">{error}</div>}
          {!versions && !error && (
            <span className="muted">
              <span className="spinner sm" /> Loading {loaderLabel(value)} versions…
            </span>
          )}
          {versions && versions.length === 0 && (
            <span className="muted">{loaderLabel(value)} is not available for Minecraft {mcVersion} yet.</span>
          )}
          {versions && versions.length > 0 && (
            <div className="row gap-s">
              <select
                className="grow"
                aria-label="Loader version"
                value={value?.version}
                onChange={(e) => onChange({ type: type as Exclude<LoaderType, 'vanilla'>, version: e.target.value }, true)}
              >
                {shown.map((v) => (
                  <option key={v.version} value={v.version}>
                    {v.version}
                    {v.recommended ? ' (recommended)' : !v.stable ? ' (beta)' : ''}
                  </option>
                ))}
              </select>
              <label className="check">
                <input type="checkbox" checked={showUnstable} onChange={(e) => setShowUnstable(e.target.checked)} /> Show betas
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
