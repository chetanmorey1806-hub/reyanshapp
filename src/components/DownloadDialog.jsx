import { useState } from 'react'
import Icon from './Icons.jsx'
import { exportImage, outputSize } from '../utils/renderer.js'

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

export default function DownloadDialog({ open, onClose, base, adj, name, notify }) {
  const [format, setFormat] = useState('image/jpeg')
  const [quality, setQuality] = useState(95)
  const [working, setWorking] = useState(false)

  if (!open) return null
  const { width, height } = outputSize(base, adj)
  const ext = format === 'image/png' ? 'png' : 'jpg'
  const fileName = `${name}-stories-by-reyansh-${stamp()}.${ext}`
  const canShare = typeof navigator.canShare === 'function' && /Android|iPhone|iPad/i.test(navigator.userAgent)

  async function makeBlob() {
    const blob = await exportImage(base, adj, format, quality / 100)
    if (!blob) throw new Error('Could not create the image file.')
    return blob
  }

  async function download() {
    setWorking(true)
    try {
      const blob = await makeBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.rel = 'noopener'
      document.body.appendChild(a) // must be in the DOM for Firefox
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30000)
      notify(`Downloaded ${fileName}`, 'success')
      onClose()
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setWorking(false)
    }
  }

  async function share() {
    setWorking(true)
    try {
      const file = new File([await makeBlob()], fileName, { type: format })
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Stories by Reyansh' })
        onClose()
      } else {
        await download()
      }
    } catch (e) {
      if (e.name !== 'AbortError') notify(e.message, 'error')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Download photo">
        <button className="icon-btn modal-close" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
        <div className="modal-icon">
          <Icon name="download" size={26} />
        </div>
        <h3>Save your photo</h3>
        <p className="muted small">
          {width} × {height}px · {((width * height) / 1e6).toFixed(1)} MP
        </p>

        <div className="segmented">
          {[
            ['image/jpeg', 'JPG', 'Smaller file'],
            ['image/png', 'PNG', 'Lossless'],
          ].map(([v, label, hint]) => (
            <button key={v} className={format === v ? 'active' : ''} onClick={() => setFormat(v)}>
              <b>{label}</b>
              <small>{hint}</small>
            </button>
          ))}
        </div>

        {format === 'image/jpeg' && (
          <div className="slider quality">
            <div className="slider-head">
              <span>Quality</span>
              <span className="slider-value">{quality}%</span>
            </div>
            <input type="range" min={60} max={100} value={quality} style={{ '--pct': `${((quality - 60) / 40) * 100}%` }} onChange={(e) => setQuality(Number(e.target.value))} />
          </div>
        )}

        <div className="modal-actions">
          {canShare && (
            <button className="btn btn-ghost" onClick={share} disabled={working}>
              <Icon name="share" size={18} /> Share / Save to Photos
            </button>
          )}
          <button className="btn btn-primary wide" onClick={download} disabled={working}>
            {working ? <span className="mini-spinner" /> : <Icon name="download" size={18} />}
            {working ? 'Preparing…' : `Download ${ext.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  )
}
