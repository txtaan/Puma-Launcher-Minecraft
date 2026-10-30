import { useEffect, useState } from 'react'
import type { Instance, RecommendedMod } from '@shared/types'
import { api } from '../api'
import { Icon } from './Icon'

/**
 * "Recommended mods" section of the new-instance dialog: popular mods that have a build for the
 * chosen loader and Minecraft version. Essentials and performance mods start ticked.
 */
export function RecommendedMods({
  mcVersion,
  loader,
  selected,
  onChange
}: {
  mcVersion: string
  loader: Instance['loader']
  selected: string[]
  onChange: (projectIds: string[]) => void
}) {
  const [mods, setMods] = useState<RecommendedMod[] | null>(null)
  const [failed, setFailed] = useState(false)
  const type = loader?.type

  useEffect(() => {
    setMods(null)
    setFailed(false)
    onChange([])
    if (!type || !mcVersion) return
    let cancelled = false
    api.mods
      .recommended(type, mcVersion)
      .then((list) => {
        if (cancelled) return
        setMods(list)
        onChange(list.filter((m) => m.preselected).map((m) => m.projectId))
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
    // Only refetch when the loader type or Minecraft version changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, mcVersion])

  if (!type) return null
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])

  return (
    <div className="field">
      <span>Recommended mods</span>
      {failed && <div className="muted">Couldn’t load recommendations. You can add mods later from the Mods window.</div>}
      {!mods && !failed && (
        <div className="muted">
          <span className="spinner sm" /> Finding mods for {mcVersion}…
        </div>
      )}
      {mods?.length === 0 && <div className="muted">No recommended mods support Minecraft {mcVersion} with this loader yet.</div>}
      {mods && mods.length > 0 && (
        <>
          <div className="recommended-grid">
            {mods.map((m) => {
              const on = selected.includes(m.projectId)
              return (
                <button
                  key={m.projectId}
                  type="button"
                  className={`recommended ${on ? 'on' : ''}`}
                  aria-pressed={on}
                  title={m.description}
                  onClick={() => toggle(m.projectId)}
                >
                  {m.iconUrl ? <img className="mod-icon sm" src={m.iconUrl} alt="" /> : <span className="mod-icon sm">{m.title[0]}</span>}
                  <span className="recommended-text">
                    <span className="recommended-title">{m.title}</span>
                    <span className="muted small clamp-1">{m.description}</span>
                  </span>
                  <span className="recommended-check">{on && <Icon name="check" size={14} />}</span>
                </button>
              )
            })}
          </div>
          <div className="muted small">
            {selected.length ? `${selected.length} mod${selected.length > 1 ? 's' : ''} will be installed with the instance.` : 'No mods selected.'}
          </div>
        </>
      )}
    </div>
  )
}
