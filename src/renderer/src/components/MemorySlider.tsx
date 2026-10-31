import { useEffect, useState, type CSSProperties } from 'react'
import { api } from '../api'
import { useStore } from '../store'

const GB = 1024
const MIN_GB = 1

// This PC's RAM, asked for once: it doesn't change while the launcher runs.
let knownTotalMb: number | undefined
let asking: Promise<number> | undefined

function useTotalMemory(): number | undefined {
  const [total, setTotal] = useState(knownTotalMb)
  useEffect(() => {
    if (knownTotalMb !== undefined) return
    let live = true
    asking ??= api.system.memory().then((m) => (knownTotalMb = m.totalMb))
    void asking.then(
      (mb) => live && setTotal(mb),
      () => (asking = undefined)
    )
    return () => {
      live = false
    }
  }, [])
  return total
}

/**
 * The slider's top end for a PC with this much RAM: all of it but 2 GB (for the system and the launcher), at most
 * 32 GB and at least 2 GB; and the memory recommended for it: a quarter of the RAM, 2 to 8 GB. In GB, on 0.5 GB steps.
 */
export function memoryRange(totalMb: number): { max: number; recommended: number } {
  const total = totalMb / GB
  const max = Math.max(2, Math.min(Math.floor((total - 2) * 2) / 2, 32))
  const recommended = Math.min(max, 8, Math.max(2, Math.round((total / 4) * 2) / 2))
  return { max, recommended }
}

/**
 * The game's memory as a slider in GB, with what's recommended for this PC. Values go in and out in MB, the unit the
 * settings and instances store. `labelId` is the id of the visible label above it.
 */
export function MemorySlider({ labelId, valueMb, onChange }: { labelId: string; valueMb: number; onChange: (mb: number) => void }) {
  const { t, locale } = useStore()
  const total = useTotalMemory()
  const range = total ? memoryRange(total) : undefined
  const gb = valueMb / GB
  // A value set before the slider existed can be over this PC's limit: the slider then stretches to show it as it is.
  const max = Math.max(range?.max ?? 8, Math.ceil(gb * 2) / 2)
  const fill = (Math.min(Math.max(gb, MIN_GB), max) - MIN_GB) / (max - MIN_GB)
  const format = (n: number) => t('memory.gb', { gb: n.toLocaleString(locale, { maximumFractionDigits: 1 }) })

  return (
    <div className="memory">
      <div className="memory-row">
        <input
          type="range"
          className="range"
          min={MIN_GB}
          max={max}
          step={0.5}
          value={gb}
          aria-labelledby={labelId}
          aria-valuetext={format(gb)}
          style={{ '--fill': fill } as CSSProperties}
          onChange={(e) => onChange(Math.round(Number(e.target.value) * GB))}
        />
        {/* The slider itself tells screen readers the value (aria-valuetext) */}
        <span className="memory-value" aria-hidden="true">
          {format(gb)}
        </span>
      </div>
      {range && (
        <small className="memory-hint muted">
          {t('memory.recommended', { gb: format(range.recommended) })}
          {valueMb !== range.recommended * GB && (
            <button type="button" className="link-btn" onClick={() => onChange(range.recommended * GB)}>
              {t('memory.useRecommended')}
            </button>
          )}
        </small>
      )}
    </div>
  )
}
