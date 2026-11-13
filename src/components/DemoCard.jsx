import { useEffect, useState } from 'react'
import Icon from './Icons.jsx'

// Landing-page showcase: a prompt is "typed", then the edited version sweeps
// across the photo (before / after). Loops through a few example edits.
const DEMOS = [
  { prompt: 'Golden hour glow, warm & soft', filter: 'sepia(0.35) saturate(1.6) hue-rotate(-12deg) brightness(1.08) contrast(1.05)' },
  { prompt: 'थोडा उजेड वाढव आणि रंग जास्त', filter: 'brightness(1.25) saturate(1.45) contrast(1.05)' },
  { prompt: 'Moody cinematic look', filter: 'contrast(1.25) saturate(0.75) hue-rotate(18deg) brightness(0.85)' },
  { prompt: 'Black and white, classic', filter: 'grayscale(1) contrast(1.3) brightness(1.05)' },
]

const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function Scene() {
  return (
    <svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="dSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5a6f9a" />
          <stop offset=".55" stopColor="#c9a48c" />
          <stop offset="1" stopColor="#e8c79c" />
        </linearGradient>
        <linearGradient id="dWater" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8d8aa0" />
          <stop offset="1" stopColor="#3b4258" />
        </linearGradient>
        <radialGradient id="dSun" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fff4d8" />
          <stop offset=".5" stopColor="#ffd890" stopOpacity=".9" />
          <stop offset="1" stopColor="#ffb870" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="250" fill="url(#dSky)" />
      <circle cx="270" cy="128" r="58" fill="url(#dSun)" />
      <circle cx="270" cy="128" r="17" fill="#fff1d0" />
      <path d="M0 150 L60 98 L105 130 L160 74 L222 140 L270 112 L330 150 L400 104 L400 165 L0 165Z" fill="#6c6a86" opacity=".75" />
      <path d="M0 165 L48 128 L96 150 L150 112 L210 158 L262 132 L318 162 L372 128 L400 140 L400 175 L0 175Z" fill="#433f5c" />
      <rect y="170" width="400" height="80" fill="url(#dWater)" />
      <g stroke="#ffe2a8" strokeLinecap="round" opacity=".7">
        <path d="M244 182 H296" strokeWidth="2.5" />
        <path d="M252 192 H288" strokeWidth="2" />
        <path d="M258 202 H282" strokeWidth="1.6" />
        <path d="M264 212 H276" strokeWidth="1.2" />
      </g>
      {/* couple silhouette on the shore */}
      <g fill="#1c1a28">
        <path d="M0 196 C80 186 150 192 230 210 C300 226 360 234 400 238 L400 250 L0 250Z" />
        <circle cx="118" cy="150" r="6.5" />
        <path d="M110 158 Q118 154 126 158 L128 192 L108 192Z" />
        <circle cx="135" cy="153" r="6" />
        <path d="M128 160 Q135 156 142 160 L150 194 L122 194Z" />
      </g>
    </svg>
  )
}

export default function DemoCard() {
  const [i, setI] = useState(0)
  const [typed, setTyped] = useState(reduceMotion ? DEMOS[0].prompt.length : 0)
  const [applied, setApplied] = useState(reduceMotion)
  const demo = DEMOS[i]
  const chars = Array.from(demo.prompt) // keeps Devanagari clusters mostly intact

  useEffect(() => {
    if (reduceMotion) return
    let t
    if (typed < chars.length) t = setTimeout(() => setTyped((n) => n + 1), 45)
    else if (!applied) t = setTimeout(() => setApplied(true), 500)
    else
      t = setTimeout(() => {
        setApplied(false)
        setTyped(0)
        setI((n) => (n + 1) % DEMOS.length)
      }, 3200)
    return () => clearTimeout(t)
  }, [typed, applied, chars.length])

  return (
    <div className="demo-card">
      <div className="demo-photo">
        <div className="demo-layer">
          <Scene />
        </div>
        <div className={`demo-layer demo-after ${applied ? 'on' : ''}`} style={{ filter: demo.filter }}>
          <Scene />
        </div>
        <div className={`demo-sweep ${applied ? 'on' : ''}`} />
        <span className="tag tag-left">Before</span>
        <span className={`tag tag-right ${applied ? 'show' : ''}`}>After</span>
      </div>
      <div className="demo-prompt">
        <Icon name="sparkle" size={16} />
        <span className="demo-text">
          {chars.slice(0, typed).join('')}
          <i className="caret" />
        </span>
        <span className={`demo-send ${typed >= chars.length ? 'ready' : ''}`}>
          <Icon name="send" size={16} />
        </span>
      </div>
    </div>
  )
}
