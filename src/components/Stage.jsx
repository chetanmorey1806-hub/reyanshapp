import { useEffect, useRef, useState } from 'react'
import { renderToCanvas } from '../utils/renderer.js'
import { DEFAULT_ADJUSTMENTS } from '../utils/adjustments.js'

const PREVIEW_MAX = 1600
const STATUS = ['Reading your photo…', 'Understanding the request…', 'Editing pixels…', 'Adding final touches…']

// Shows the edited photo. In compare mode the original is revealed on the left
// of a draggable divider (before / after slider).
export default function Stage({ base, adj, original, compare, busy, revealKey }) {
  const editedRef = useRef(null)
  const originalRef = useRef(null)
  const [split, setSplit] = useState(50)
  const [step, setStep] = useState(0)

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (editedRef.current) renderToCanvas(editedRef.current, base, adj, PREVIEW_MAX)
    })
    return () => cancelAnimationFrame(frame)
  }, [base, adj, revealKey]) // revealKey remounts the canvas, so redraw it

  // cycle the status text while the AI works
  useEffect(() => {
    if (!busy) return setStep(0)
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STATUS.length - 1)), 2200)
    return () => clearInterval(t)
  }, [busy])

  useEffect(() => {
    if (!compare || !originalRef.current) return
    // CSS stretches this layer over the edited photo, so its own size can differ
    renderToCanvas(originalRef.current, original, DEFAULT_ADJUSTMENTS, PREVIEW_MAX)
  }, [compare, original, base, adj, revealKey])

  function moveSplit(clientX) {
    const r = editedRef.current.getBoundingClientRect()
    setSplit(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)))
  }

  return (
    <div className="stage-inner">
      <div className={`photo-shell ${busy ? 'is-busy' : ''}`}>
        <div
          className="photo-frame"
          onPointerDown={(e) => {
            if (!compare) return
            e.currentTarget.setPointerCapture(e.pointerId)
            moveSplit(e.clientX)
          }}
          onPointerMove={(e) => compare && e.buttons && moveSplit(e.clientX)}
        >
          <canvas key={revealKey} ref={editedRef} className="photo-canvas reveal-in" />
          {compare && (
            <>
              <canvas ref={originalRef} className="photo-canvas original-layer" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }} />
              <div className="split-line" style={{ left: `${split}%` }}>
                <span className="split-handle">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 6l-6 6 6 6M15 6l6 6-6 6" />
                  </svg>
                </span>
              </div>
              <span className="tag tag-left show">Before</span>
              <span className="tag tag-right show">After</span>
            </>
          )}
          {busy && (
            <div className="magic-overlay">
              <div className="shimmer" />
              <div className="magic-label">
                <span className="orb" />
                <span key={step} className="status-text">
                  {STATUS[step]}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
