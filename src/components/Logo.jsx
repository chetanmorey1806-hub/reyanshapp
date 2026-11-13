export default function Logo({ size = 40, withText = true }) {
  return (
    <div className="logo">
      <svg className="logo-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f3d39b" />
            <stop offset=".5" stopColor="#e9a27c" />
            <stop offset="1" stopColor="#a48bff" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="28" fill="none" stroke="url(#logoGrad)" strokeWidth="3" />
        <g className="logo-blades" stroke="url(#logoGrad)" strokeWidth="2.2" strokeLinecap="round" opacity=".55">
          <path d="M32 6 L41 22" />
          <path d="M54.5 19 L37 21" />
          <path d="M54.5 45 L46 30" />
          <path d="M32 58 L23 42" />
          <path d="M9.5 45 L27 43" />
          <path d="M9.5 19 L18 34" />
        </g>
        <text x="32" y="42" textAnchor="middle" fontFamily="'Instrument Serif', Georgia, serif" fontStyle="italic" fontWeight="400" fontSize="32" fill="url(#logoGrad)">
          R
        </text>
      </svg>
      {withText && (
        <div className="logo-text">
          <span className="logo-stories">Stories</span>
          <span className="logo-by">by Reyansh</span>
        </div>
      )}
    </div>
  )
}
