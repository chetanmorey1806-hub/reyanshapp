import { useEffect, useRef, useState } from 'react'
import { renderToCanvas } from '../utils/renderer.js'
import { DEFAULT_ADJUSTMENTS } from '../utils/adjustments.js'

const PREVIEW_MAX = 1600
const STATUS = ['Reading your photo…', 'Understanding the request…', 'Editing pixels…', 'Adding final touches…']
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

// Shows the edited photo.
// - compare: original revealed left of a draggable divider
// - crop tool: full frame with a movable / resizable crop box
// - text layers can be dragged directly on the photo
export default function Stage({ base, adj, original, compare, busy, revealKey, tool, crop, setCrop, cropRatio, selectedText, setSelectedText, onTextStart, onTextMove, onTextEnd }) {
  const editedRef = useRef(null)
  const originalRef = useRef(null)
  const renderRef = useRef(null)
  const dragRef = useRef(null)
  const [split, setSplit] = useState(50)
  const [step, setStep] = useState(0)
  const [fontTick, setFontTick] = useState(0)
  const [boxes, setBoxes] = useState([])
  const cropping = tool === 'crop'

  // re-draw when web fonts finish loading (text layers)
  useEffect(() => {
    const f = () => setFontTick((n) => n + 1)
    document.fonts?.addEventListener?.('loadingdone', f)
    window.addEventListener('brandchange', f)
    return () => {
      document.fonts?.removeEventListener?.('loadingdone', f)
      window.removeEventListener('brandchange', f)
    }
  }, [])

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (!editedRef.current) return
      const view = cropping ? { ...adj, crop: null, frame: 0, texts: [] } : adj
      renderRef.current = renderToCanvas(editedRef.current, base, view, PREVIEW_MAX)
      setBoxes(renderRef.current.textBoxes)
    })
    return () => cancelAnimationFrame(frame)
  }, [base, adj, revealKey, cropping, fontTick]) // revealKey remounts the canvas, so redraw it

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

  const point = (e) => {
    const r = editedRef.current.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }

  // ---- crop box ----
  function cropDown(e, mode) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { kind: 'crop', mode, p: point(e), r: { ...crop } }
  }

  function cropMove(e) {
    const d = dragRef.current
    const c = editedRef.current
    const p = point(e)
    const dx = p.x - d.p.x
    const dy = p.y - d.p.y
    const r = d.r
    if (d.mode === 'move') {
      setCrop({ ...r, x: clamp(r.x + dx, 0, 1 - r.w), y: clamp(r.y + dy, 0, 1 - r.h) })
      return
    }
    let left = r.x, right = r.x + r.w, top = r.y, bottom = r.y + r.h
    if (d.mode.includes('w')) left = clamp(left + dx, 0, right - 0.05)
    if (d.mode.includes('e')) right = clamp(right + dx, left + 0.05, 1)
    if (d.mode.includes('n')) top = clamp(top + dy, 0, bottom - 0.05)
    if (d.mode.includes('s')) bottom = clamp(bottom + dy, top + 0.05, 1)
    if (cropRatio) {
      const rn = cropRatio * (c.height / c.width) // ratio in normalised units
      let w = right - left
      let h = w / rn
      const maxH = d.mode.includes('n') ? r.y + r.h : 1 - r.y
      if (h > maxH) {
        h = maxH
        w = h * rn
      }
      if (d.mode.includes('w')) left = right - w
      else right = left + w
      if (d.mode.includes('n')) top = bottom - h
      else bottom = top + h
    }
    setCrop({ x: left, y: top, w: right - left, h: bottom - top })
  }

  // ---- text drag ----
  function frameDown(e) {
    if (compare) {
      e.currentTarget.setPointerCapture(e.pointerId)
      moveSplit(e.clientX)
      return
    }
    if (cropping || busy) return
    const p = point(e)
    const hit = [...boxes].reverse().find((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h)
    if (!hit) {
      if (tool === 'text') setSelectedText(null)
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    const layer = adj.texts.find((t) => t.id === hit.id)
    setSelectedText(hit.id)
    onTextStart(hit.id)
    dragRef.current = { kind: 'text', id: hit.id, p, x: layer.x, y: layer.y }
  }

  function frameMove(e) {
    if (compare) return e.buttons && moveSplit(e.clientX)
    const d = dragRef.current
    if (!d) return
    if (d.kind === 'crop') return cropMove(e)
    const L = renderRef.current.layout
    const p = point(e)
    onTextMove(d.id, clamp(d.x + ((p.x - d.p.x) * L.W) / L.cw, 0, 1), clamp(d.y + ((p.y - d.p.y) * L.H) / L.ch, 0, 1))
  }

  function frameUp() {
    if (dragRef.current?.kind === 'text') onTextEnd()
    dragRef.current = null
  }

  function moveSplit(clientX) {
    const r = editedRef.current.getBoundingClientRect()
    setSplit(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)))
  }

  const sel = !cropping && tool === 'text' && boxes.find((b) => b.id === selectedText)
  const pct = (v) => `${v * 100}%`

  return (
    <div className="stage-inner">
      <div className={`photo-shell ${busy ? 'is-busy' : ''}`}>
        <div
          className={`photo-frame ${boxes.length && !cropping && !compare ? 'has-text' : ''}`}
          onPointerDown={frameDown}
          onPointerMove={frameMove}
          onPointerUp={frameUp}
          onPointerCancel={frameUp}
        >
          <canvas key={revealKey} ref={editedRef} className="photo-canvas reveal-in" />

          {sel && <div className="text-select" style={{ left: pct(sel.x), top: pct(sel.y), width: pct(sel.w), height: pct(sel.h) }} />}

          {cropping && crop && (
            <div className="crop-layer">
              <div
                className="crop-box"
                style={{ left: pct(crop.x), top: pct(crop.y), width: pct(crop.w), height: pct(crop.h) }}
                onPointerDown={(e) => cropDown(e, 'move')}
              >
                <i className="grid-v" />
                <i className="grid-h" />
                {['nw', 'ne', 'sw', 'se'].map((m) => (
                  <span key={m} className={`handle ${m}`} onPointerDown={(e) => cropDown(e, m)} />
                ))}
              </div>
            </div>
          )}

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
