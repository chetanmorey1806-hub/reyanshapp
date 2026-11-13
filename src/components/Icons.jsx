// Small inline icon set (stroke icons, 24px grid)
const paths = {
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'm15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  compare: 'M12 3v18M5 5h4v14H5zM15 5h4v14h-4z',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  reset: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  download: 'M12 3v12m0 0-5-5m5 5 5-5M5 21h14',
  share: 'M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13',
  image: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M21 15l-5-5L5 21',
  send: 'M5 12h14M13 6l6 6-6 6',
  sparkle: 'M12 3l1.8 4.6L18.5 9.5l-4.7 1.9L12 16l-1.8-4.6L5.5 9.5l4.7-1.9zM19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8zM5 15l.6 1.4 1.4.6-1.4.6L5 19l-.6-1.4L3 17l1.4-.6z',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3M5 11a7 7 0 0 0 14 0M12 18v3',
  close: 'M6 6l12 12M18 6 6 18',
  upload: 'M12 16V4m0 0-4 4m4-4 4 4M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3',
  wand: 'M15 4V2M15 10V8M11 6h2M17 6h2M3 21l12-12M13.5 4.5l6 6',
  rotateL: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  rotateR: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  flipH: 'M12 3v18M16 7l4 5-4 5M8 7l-4 5 4 5',
  flipV: 'M3 12h18M7 8l5-4 5 4M7 16l5 4 5-4',
  check: 'M5 12l5 5 9-10',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  layers: 'M12 3 2 8l10 5 10-5zM2 16l10 5 10-5M2 12l10 5 10-5',
}

export default function Icon({ name, size = 20, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={paths[name]} />
    </svg>
  )
}
