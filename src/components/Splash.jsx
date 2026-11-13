import { useEffect, useState } from 'react'
import Logo from './Logo.jsx'

// 3-second animated intro shown when the app starts (tap to skip).
const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const TOTAL = reduce ? 900 : 3000
const LEAVE = 450

export default function Splash({ onDone }) {
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const a = setTimeout(() => setLeaving(true), TOTAL - LEAVE)
    const b = setTimeout(onDone, TOTAL)
    return () => {
      clearTimeout(a)
      clearTimeout(b)
    }
  }, [onDone])

  return (
    <div
      className={`splash ${leaving ? 'leaving' : ''}`}
      role="presentation"
      onClick={() => {
        setLeaving(true)
        setTimeout(onDone, LEAVE)
      }}
    >
      <div className="splash-glow" />
      <div className="splash-inner">
        <Logo size={96} animated />
        <span className="splash-line" />
        <p className="splash-tag">AI photo & reel studio</p>
      </div>
      <div className="splash-bar">
        <i />
      </div>
    </div>
  )
}
