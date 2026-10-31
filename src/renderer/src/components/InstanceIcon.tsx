import { useId, useRef, type CSSProperties, type KeyboardEvent } from 'react'
import type { Instance } from '@shared/types'
import { useStore } from '../store'

/**
 * Instance icons: 16×16 pixel art drawn here in code (no image files, nothing taken from the game).
 * Each row is 16 pixels; a letter is a colour from `colors`, '.' is transparent. `tint` colours the tile behind it.
 */
interface PixelArt {
  tint: string
  colors: Record<string, string>
  rows: string[]
}

const ART = {
  grass: {
    tint: '#6cbf4a',
    colors: { A: '#9ad65a', B: '#6fb83f', C: '#5a9e33', L: '#5c9e35', M: '#4a8329', D: '#8b5d3b', E: '#a87650', F: '#6e4529', R: '#6b4429', S: '#57361f' },
    rows: [
      '.......AB.......',
      '.....BABBBB.....',
      '...BBBBBABBCB...',
      '.BBABBCBBBBBABB.',
      'LBBBBBBBABBCBBBM',
      'LLLBCBBBBBBABMMM',
      'DLLLLBBABBBMMMMR',
      'DLDLLLLBBMMMMRMR',
      'DDDDLLLLMMMMRRRR',
      'DEDDDDLLMMRRSRRR',
      'DDDDEDDDRRRRRRSR',
      'DDFDDDDDRRSRRRRR',
      '.DDDDDEDRRRRRSR.',
      '...DDDDDRRSRR...',
      '.....DFDRRR.....',
      '.......DR.......'
    ]
  },
  stone: {
    tint: '#8d96a0',
    colors: { A: '#c2c2c2', B: '#a3a3a3', C: '#8c8c8c', L: '#8a8a8a', K: '#9c9c9c', J: '#727272', R: '#696969', S: '#7a7a7a', T: '#575757' },
    rows: [
      '.......BA.......',
      '.....BBBCBB.....',
      '...BACBBBBABB...',
      '.BBBBBBCCBBBBCB.',
      'LBCBBABBBBBBABBR',
      'LLKBBBBBCBBBBRRR',
      'LLLJJBBBBBARRSRR',
      'LJLLLLLBBRRRRRTR',
      'LLLLKLLLRTTRRRRR',
      'LKLLLLJJRRRRSRRR',
      'LLJJLLLLRRRRRTTR',
      'LLLLLKLLRSRRRRRR',
      '.LLLLLLLRRRTRRR.',
      '...LJJLLRRRRR...',
      '.....LLKRRS.....',
      '.......LR.......'
    ]
  },
  diamond: {
    tint: '#3fc8d4',
    colors: { O: '#0e5d63', W: '#ffffff', H: '#b5fff7', L: '#6ff0e2', M: '#2fcfc0', D: '#1a9a92' },
    rows: [
      '................',
      '................',
      '................',
      '....OOOOOOOO....',
      '...OWHHLLLLMO...',
      '..OWHLLLLLLMMO..',
      '.OHLLLLLLLLLMMO.',
      '.OMMMMMMMMMMMDO.',
      '..OLMLLLLLLMDO..',
      '...OLMLLLLMDO...',
      '....OLMLLMDO....',
      '.....OLMMDO.....',
      '......OLDO......',
      '.......OO.......',
      '................',
      '................'
    ]
  },
  emerald: {
    tint: '#2fbf71',
    colors: { O: '#0b4d2a', W: '#f0fff0', H: '#a8f5b8', L: '#4fdc7a', M: '#22b553', D: '#12853a' },
    rows: [
      '................',
      '......OOOO......',
      '.....OHHLMO.....',
      '....OHWLLLMO....',
      '...OHWMMMMLDO...',
      '...OHMHHLLMDO...',
      '...OHMHLLLMDO...',
      '...OHMLLLLMDO...',
      '...OLMLLLLMDO...',
      '...OLMLLLMMDO...',
      '...OLMLLMMMDO...',
      '...OLMMMMMMDO...',
      '....OLMMMDDO....',
      '.....OMMDDO.....',
      '......OOOO......',
      '................'
    ]
  },
  gold: {
    tint: '#f2b632',
    colors: { O: '#6e4206', W: '#fffbe0', H: '#fff1a8', Y: '#ffd84a', G: '#f0b020', D: '#c98a10', E: '#9c6508' },
    rows: [
      '................',
      '................',
      '................',
      '....OOOOOOOO....',
      '...OWWHYYYYYO...',
      '...OWYYYYYYGO...',
      '..OHYYYYYYYYGO..',
      '..OYYYYYYYYYGO..',
      '.OHHHHHHHHHHHGO.',
      '.OGGGGGGGGGGGDO.',
      '.ODDDDDDDDDDDEO.',
      '.OOOOOOOOOOOOOO.',
      '................',
      '................',
      '................',
      '................'
    ]
  },
  redstone: {
    tint: '#e0453a',
    colors: { H: '#ffb3a6', R: '#f0362a', M: '#c21d12', D: '#86120b' },
    rows: [
      '................',
      '................',
      '................',
      '.........M......',
      '........MHM.....',
      '.....MM..M..M...',
      '....MRHM...MHM..',
      '...MRRRRMM..M...',
      '..MRRHRRRRM.....',
      '..MRRRRRMRRM.M..',
      '.MRRHRRRRRHRMRM.',
      '.MRRRRMRRRRRRRM.',
      '.DRRRRRRRHRRRMD.',
      '..DDMDDMDDMDDD..',
      '................',
      '................'
    ]
  },
  tnt: {
    tint: '#e8613c',
    colors: { R: '#db4330', r: '#b83224', W: '#efebe2', K: '#2b2b2b', E: '#c9c3b6' },
    rows: [
      '................',
      '.RRrRRRrRRRrRRr.',
      '.RRrRRRrRRRrRRr.',
      '.RRrRRRrRRRrRRr.',
      '.RRrRRRrRRRrRRr.',
      '.WWWWWWWWWWWWWE.',
      '.WKKKWKWWKWKKKE.',
      '.WWKWWKKWKWWKWE.',
      '.WWKWWKWKKWWKWE.',
      '.WWKWWKWWKWWKWE.',
      '.EEEEEEEEEEEEEE.',
      '.RRrRRRrRRRrRRr.',
      '.RRrRRRrRRRrRRr.',
      '.RRrRRRrRRRrRRr.',
      '.rrrrrrrrrrrrrr.',
      '................'
    ]
  },
  creeper: {
    tint: '#64c445',
    colors: { A: '#8fe07a', G: '#5cc24a', H: '#4aa83c', K: '#111a11' },
    rows: [
      '................',
      '.GHGGAGGHGGGAGH.',
      '.HKKKKGAGHKKKKG.',
      '.GKKKKHGGGKKKKA.',
      '.GKKKKGGAGKKKKG.',
      '.GKKKKGHGGKKKKG.',
      '.AGGHGKKKKGGHGA.',
      '.GHGGAKKKKGAGGG.',
      '.GGAKKKKKKKKGHG.',
      '.GHGKKKKKKKKGGG.',
      '.GGGKKKKKKKKAGH.',
      '.HGAKKKKKKKKGGG.',
      '.GAGKKGGHGKKGAG.',
      '.GGGKKGAGGKKGGH.',
      '.AGHGGGGHGAGGGA.',
      '................'
    ]
  },
  pickaxe: {
    tint: '#5b8bd6',
    colors: { O: '#2c3440', W: '#ffffff', L: '#d9e0e8', M: '#a7b2bf', B: '#a8743c', b: '#6e4920', o: '#3d2810' },
    rows: [
      '................',
      '...OOOOOOO......',
      '..OWWLLLLLOO....',
      '...OOMMMMLLLO...',
      '.......OOMMLLO..',
      '.........OMMLO..',
      '........OoOMLLO.',
      '.......ObBOOMLO.',
      '......ObBo.OMLO.',
      '.....ObBo..OMLO.',
      '....ObBo...OMLO.',
      '...ObBo.....OO..',
      '..ObBo..........',
      '.ObBo...........',
      '.ooo............',
      '................'
    ]
  },
  sword: {
    tint: '#7c6cf0',
    colors: { O: '#0e4d52', W: '#ffffff', L: '#8ff5ea', M: '#3fd2c6', K: '#1f6f73', k: '#5fb8b3', B: '#c08a4a', b: '#7a5126' },
    rows: [
      '................',
      '............OOO.',
      '...........OWLO.',
      '..........OWLMO.',
      '.........OWLMO..',
      '........OWLMO...',
      '.......OWLMO....',
      '......OWLMO.....',
      '..OO.OWLMO......',
      '..OkKOLMO.......',
      '...OkKMO........',
      '...OBOkKO.......',
      '..OBbO.OO.......',
      '.OBbO...........',
      '.OOO............',
      '................'
    ]
  },
  chest: {
    tint: '#c58a3e',
    colors: { O: '#3b2410', T: '#e3a85c', L: '#c98a3f', l: '#a86f2f', B: '#b87838', b: '#9a612b', D: '#87521f', K: '#2a1808', S: '#f2f2f2', s: '#a8a8a8', k: '#2e2e2e' },
    rows: [
      '................',
      '.OOOOOOOOOOOOOO.',
      '.OTTTTTTTTTTTTO.',
      '.OLLLLLLLLLLLlO.',
      '.OLLLLLLLLLLLlO.',
      '.OLLLLLkkLLLLlO.',
      '.OllllkSSklllDO.',
      '.OKKKKkSskKKKKO.',
      '.OBBBBksskBBBbO.',
      '.OBBBBBkkBBBBbO.',
      '.ObbbbbbbbbbbDO.',
      '.OBBBBBBBBBBBbO.',
      '.OBBBBBBBBBBBbO.',
      '.ODDDDDDDDDDDDO.',
      '.OOOOOOOOOOOOOO.',
      '................'
    ]
  },
  portal: {
    tint: '#9b5de5',
    colors: { K: '#140c20', k: '#2a1c40', j: '#45336a', P: '#7a2fd6', p: '#5a1fb0', Q: '#b070ff', W: '#ecd6ff' },
    rows: [
      '..kkkkkkkkkkkk..',
      '..kjjkkkkjkkkK..',
      '..kjPPpQQPPpkK..',
      '..kkPQQPPQPPkK..',
      '..kkQPPpPPQPkK..',
      '..kjQPQQQPQpkK..',
      '..kkPQPWQPQPkK..',
      '..kkPQPPQPQPkK..',
      '..kjPPQQPQPpkK..',
      '..kkpPPPQPPQkK..',
      '..kkQQPPPQQPkK..',
      '..kjPPQQQPPpkK..',
      '..kkpPPPPQQPkK..',
      '..kkPQQPPPPWkK..',
      '..kjkkkkkkjkkK..',
      '..KKKKKKKKKKKK..'
    ]
  }
} satisfies Record<string, PixelArt>

export type InstanceIconId = keyof typeof ART

/** Every icon, in the order the picker shows them. */
export const INSTANCE_ICONS = Object.keys(ART) as InstanceIconId[]

/** The icon an instance gets until the player picks one: a sword for a server, otherwise one per mod loader. */
export function defaultIcon(instance: Pick<Instance, 'loader' | 'server'>): InstanceIconId {
  if (instance.server?.trim()) return 'sword'
  switch (instance.loader?.type) {
    case 'fabric':
      return 'pickaxe'
    case 'forge':
      return 'chest'
    case 'neoforge':
      return 'emerald'
    case 'quilt':
      return 'portal'
    default:
      return 'grass'
  }
}

const isIcon = (id: string | undefined): id is InstanceIconId => !!id && Object.hasOwn(ART, id)

/** The icon to show for an instance (an unknown stored id, e.g. from a newer launcher, falls back to the default). */
export function instanceIcon(instance: Pick<Instance, 'icon' | 'loader' | 'server'>): InstanceIconId {
  return isIcon(instance.icon) ? instance.icon : defaultIcon(instance)
}

/** The icon's tile colour, for backgrounds drawn around a bare icon (`--tint`). */
export const iconTint = (id: InstanceIconId) => ART[id].tint

// A run of same-coloured pixels in a row is drawn as one <rect>, and worked out once per icon.
type Run = { x: number; y: number; w: number; fill: string }
const runCache = new Map<InstanceIconId, Run[]>()
function runs(id: InstanceIconId): Run[] {
  const cached = runCache.get(id)
  if (cached) return cached
  const art: PixelArt = ART[id]
  const list: Run[] = []
  art.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      let w = 1
      while (row[x + w] === row[x]) w++
      if (row[x] !== '.') list.push({ x, y, w, fill: art.colors[row[x]] })
      x += w
    }
  })
  runCache.set(id, list)
  return list
}

/** Just the pixel art. Sizes that are multiples of 16 keep every pixel the same size. */
export function PixelIcon({ icon, size }: { icon: InstanceIconId; size: number }) {
  return (
    <svg className="pixel-icon" width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden>
      {runs(icon).map((r) => (
        <rect key={`${r.x},${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </svg>
  )
}

/**
 * An instance's icon on its rounded, tinted tile (`size` is the tile; the art inside is the largest multiple of 16
 * that leaves a margin). `bare` draws only the art, at `size`, for places that tint their own background.
 */
export function InstanceIcon({
  instance,
  size = 40,
  bare = false
}: {
  instance: Pick<Instance, 'icon' | 'loader' | 'server'>
  size?: number
  bare?: boolean
}) {
  const icon = instanceIcon(instance)
  if (bare) return <PixelIcon icon={icon} size={size} />
  const art = Math.min(size, Math.max(16, Math.floor((size * 0.8) / 16) * 16))
  return (
    <span className="pixel-tile" style={{ width: size, height: size, '--tint': iconTint(icon) } as CSSProperties} aria-hidden>
      <PixelIcon icon={icon} size={art} />
    </span>
  )
}

/**
 * The 12 icons as a radio group. `value` is the instance's own choice; while it has none, `fallback` (its default
 * icon) shows as chosen. Arrow keys move the choice, as in any radio group.
 */
export function IconPicker({ value, fallback, onChange }: { value?: string; fallback: InstanceIconId; onChange: (icon: InstanceIconId) => void }) {
  const { t } = useStore()
  const id = useId()
  const group = useRef<HTMLDivElement>(null)
  const chosen = isIcon(value) ? value : fallback

  const onKey = (e: KeyboardEvent) => {
    const count = INSTANCE_ICONS.length
    const at = INSTANCE_ICONS.indexOf(chosen)
    const moves: Record<string, number> = { ArrowRight: at + 1, ArrowDown: at + 1, ArrowLeft: at - 1, ArrowUp: at - 1, Home: 0, End: count - 1 }
    if (!(e.key in moves)) return
    e.preventDefault()
    const next = (moves[e.key] + count) % count
    onChange(INSTANCE_ICONS[next])
    group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
  }

  return (
    <div className="field">
      <span id={id}>{t('icon.title')}</span>
      <div ref={group} className="icon-picker" role="radiogroup" aria-labelledby={id} onKeyDown={onKey}>
        {INSTANCE_ICONS.map((icon) => (
          <button
            key={icon}
            type="button"
            role="radio"
            aria-checked={icon === chosen}
            tabIndex={icon === chosen ? 0 : -1}
            className="icon-choice pixel-tile"
            style={{ '--tint': iconTint(icon) } as CSSProperties}
            aria-label={t(`icon.${icon}`)}
            title={t(`icon.${icon}`)}
            onClick={() => onChange(icon)}
          >
            <PixelIcon icon={icon} size={32} />
          </button>
        ))}
      </div>
    </div>
  )
}
