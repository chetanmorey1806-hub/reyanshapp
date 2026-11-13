// Stories by Reyansh – brand mark: a camera aperture (ring + six shutter
// blades) around a serif "R" monogram, with the wordmark beside it.
// `animated` plays the intro (ring draws, shutter opens, monogram appears).

let gid = 0

export function LogoMark({ size = 40, animated = false }) {
  const id = `lg${gid++}`
  const blades = Array.from({ length: 6 }, (_, i) => i * 60)
  return (
    <svg className={`logo-mark ${animated ? 'is-animated' : ''}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6dca8" />
          <stop offset=".55" stopColor="#e9a27c" />
          <stop offset="1" stopColor="#a48bff" />
        </linearGradient>
      </defs>
      <circle className="lm-ring" cx="32" cy="32" r="29" fill="none" stroke={`url(#${id})`} strokeWidth="2.4" pathLength="100" />
      <g className="lm-blades" stroke={`url(#${id})`} strokeWidth="1.6" strokeLinecap="round" fill="none">
        {blades.map((a) => (
          <path key={a} d="M32 9.5 C 38 15, 41.5 19, 43.5 24.5" transform={`rotate(${a} 32 32)`} pathLength="100" />
        ))}
      </g>
      <text className="lm-r" x="32.5" y="43" textAnchor="middle" fontFamily="'Instrument Serif', Georgia, serif" fontStyle="italic" fontSize="30" fill={`url(#${id})`}>
        R
      </text>
    </svg>
  )
}

export default function Logo({ size = 40, withText = true, animated = false }) {
  return (
    <div className={`logo ${animated ? 'is-animated' : ''}`}>
      <LogoMark size={size} animated={animated} />
      {withText && (
        <div className="logo-text">
          <span className="logo-stories">
            {animated
              ? 'Stories'.split('').map((c, i) => (
                  <span key={i} className="lt" style={{ '--i': i }}>
                    {c}
                  </span>
                ))
              : 'Stories'}
          </span>
          <span className="logo-by">by Reyansh</span>
        </div>
      )}
    </div>
  )
}
