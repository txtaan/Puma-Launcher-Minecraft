// Minimal inline icon set (stroke icons, 24px grid) so the UI has no icon-font dependency.
const PATHS: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  layers: 'M12 3 2 8l10 5 10-5zM2 13l10 5 10-5M2 18l10 5 10-5',
  coffee: 'M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 9h1.5a2.5 2.5 0 0 1 0 5H17M8 2v3M12 2v3',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  play: 'M7 4.5v15l12-7.5z',
  stop: 'M6 6h12v12H6z',
  plus: 'M12 5v14M5 12h14',
  folder: 'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  terminal: 'M4 5h16v14H4zM7 9l3 3-3 3M12 15h5',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  download: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h11',
  x: 'M6 6l12 12M18 6 6 18',
  min: 'M5 12h14',
  max: 'M5 5h14v14H5z',
  check: 'M5 12l5 5 9-10',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  puzzle:
    'M10 3h4v3a2 2 0 1 0 4 0V3h3v7h-3a2 2 0 1 0 0 4h3v7h-7v-3a2 2 0 1 0-4 0v3H3v-7h3a2 2 0 1 0 0-4H3V3z',
  server: 'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
  shirt: 'M8.5 3 4 5.5l1.8 4.2L8 8.8V21h8V8.8l2.2.9L20 5.5 15.5 3a3.5 3.5 0 0 1-7 0z',
  pencil: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  eraser: 'M8 20h12M4.6 15.4l9.9-9.9a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L12 18H7.2zM9.5 10.5l5 5',
  bucket: 'M4.5 11.5 11 5l7 7-6.5 6.5a1.4 1.4 0 0 1-2 0l-5-5a1.4 1.4 0 0 1 0-2zM4.5 12.5h13M9 3l2 2M20.5 15.5s1.5 1.9 1.5 3a1.5 1.5 0 0 1-3 0c0-1.1 1.5-3 1.5-3z',
  pipette: 'M13 7l4 4M4 20l1-3 9-9 2 2-9 9zM14 6l2.5-2.5a2.1 2.1 0 0 1 3 3L17 9',
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M3 3l18 18M10.6 5.1Q11.3 5 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 3.8M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  bookmark: 'M6 3.5h12V21l-6-4.2L6 21z',
  bookmarkFilled: 'M6 3.5h12V21l-6-4.2L6 21z',
  minus: 'M5 12h14',
  camera: 'M4 7.5h3l2-3h6l2 3h3a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1zM12 17a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6z',
  pause: 'M6.5 5h3.5v14H6.5zM14 5h3.5v14H14z',
  mirror: 'M12 3v18M9 7l-6 5 6 5zM15 7l6 5-6 5z',
  upload: 'M12 20V8M7 13l5-5 5 5M4 4h16',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  chevron: 'M9 6l6 6-6 6',
  image: 'M4 4h16v16H4zM4 16l5-5 4 4 2-2 5 5M15.5 9h.01',
  save: 'M5 3.5h11l3 3V20.5H5zM8 3.5V8h7V3.5M8 20.5V14h8v6.5',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  rename: 'M5 7V5h14v2M12 5v14M9 19h6',
  cube: 'M12 2.5 20.5 7v10L12 21.5 3.5 17V7zM3.5 7l8.5 4.5L20.5 7M12 11.5v10'
}

/** Icons drawn as solid shapes rather than outlines. */
const FILLED = new Set(['play', 'stop', 'pause', 'bookmarkFilled'])

export function Icon({ name, size = 18, className }: { name: keyof typeof PATHS | string; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={FILLED.has(name) ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={name === 'dots' ? 3 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={PATHS[name] ?? ''} />
    </svg>
  )
}
