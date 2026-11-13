import { useCallback, useEffect, useRef, useState } from 'react'
import Logo from './components/Logo.jsx'
import Icon from './components/Icons.jsx'
import Landing from './components/Landing.jsx'
import Stage from './components/Stage.jsx'
import ChatPanel from './components/ChatPanel.jsx'
import AdjustSheet from './components/AdjustSheet.jsx'
import DownloadDialog from './components/DownloadDialog.jsx'
import Toasts from './components/Toasts.jsx'
import { DEFAULT_ADJUSTMENTS, clampAdjustments } from './utils/adjustments.js'
import { interpretPrompt } from './utils/promptParser.js'
import { loadAnyImage } from './utils/imageLoader.js'
import { autoEnhance, imageStats, snapshot, toDataUrl } from './utils/analyze.js'

let uid = 0
const nextId = () => ++uid

function loadDataUrl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('The AI returned an image that could not be opened.'))
    img.src = src
  })
}

export default function App() {
  // photo = the uploaded original; edit = current { base image, adjustments }
  const [photo, setPhoto] = useState(null)
  const [edit, setEdit] = useState(null)
  const [past, setPast] = useState([])
  const [future, setFuture] = useState([])
  const [messages, setMessages] = useState([])
  const [caps, setCaps] = useState({ ai: false, generative: false })
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState('')
  const [error, setError] = useState('')
  const [compare, setCompare] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [downloadOpen, setDownloadOpen] = useState(false)
  const [toasts, setToasts] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const [revealKey, setRevealKey] = useState(0)
  const editRef = useRef(edit)
  editRef.current = edit
  const fileRef = useRef(null)

  useEffect(() => {
    fetch('/api/status')
      .then((r) => r.json())
      .then((s) => setCaps({ ai: Boolean(s.ai), generative: Boolean(s.generative) }))
      .catch(() => {})
  }, [])

  const notify = useCallback((text, tone = 'info') => {
    const id = nextId()
    setToasts((t) => [...t, { id, text, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500)
  }, [])

  const say = (text, extra = {}) => setMessages((m) => [...m, { id: nextId(), role: 'bot', text, ...extra }])

  // ---- history ---------------------------------------------------------
  const commit = useCallback((next) => {
    const prev = editRef.current
    setPast((p) => [...p.slice(-30), prev])
    setFuture([])
    setEdit(next)
    editRef.current = next // keep ref in sync for back-to-back commits
    setRevealKey((k) => k + 1)
  }, [])
  const commitAdj = useCallback((adj) => commit({ ...editRef.current, adj }), [commit])

  const histRef = useRef({ past, future })
  histRef.current = { past, future }

  const undo = useCallback(() => {
    const { past: p, future: f } = histRef.current
    if (!p.length) return
    setFuture([editRef.current, ...f])
    setEdit(p[p.length - 1])
    setPast(p.slice(0, -1))
    setRevealKey((k) => k + 1)
  }, [])
  const redo = useCallback(() => {
    const { past: p, future: f } = histRef.current
    if (!f.length) return
    setPast([...p, editRef.current])
    setEdit(f[0])
    setFuture(f.slice(1))
    setRevealKey((k) => k + 1)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || /TEXTAREA|INPUT/.test(e.target.tagName)) return
      const k = e.key.toLowerCase()
      if (k === 'z') {
        e.preventDefault()
        e.shiftKey ? redo() : undo()
      } else if (k === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  // ---- open a photo -----------------------------------------------------
  async function handleFile(file) {
    setError('')
    setLoading(file.name)
    try {
      const { img, url } = await loadAnyImage(file)
      if (photo) URL.revokeObjectURL(photo.url)
      const w = img.naturalWidth || img.width
      const h = img.naturalHeight || img.height
      setPhoto({ img, url, name: file.name.replace(/\.[^.]+$/, '') || 'photo', w, h })
      setEdit({ base: img, adj: DEFAULT_ADJUSTMENTS })
      setPast([])
      setFuture([])
      setCompare(false)
      setMessages([
        {
          id: nextId(),
          role: 'bot',
          text: `Your photo is ready (${w}×${h}). Tell me how you'd like it to look, in any language. For example “make it warm and cinematic” or “थोडा उजेड वाढव”.`,
        },
      ])
    } catch (e) {
      setError(e.message)
      notify(e.message, 'error')
    } finally {
      setLoading('')
    }
  }

  // ---- prompt → edit ----------------------------------------------------
  // With Gemini configured, EVERY prompt goes to the generative model so the
  // photo is edited exactly as described (like the Gemini app). Only lossless
  // geometry (rotate / flip) and reset stay local.
  // Without Gemini:
  // 1. Known looks/adjustments (EN/MR/HI) → instant, full resolution
  // 2. Claude → understands any wording, maps it to adjustments
  // 3. Offline auto-enhance → photo-aware improvement, so every prompt edits the photo
  async function handlePrompt(text) {
    setMessages((m) => [...m, { id: nextId(), role: 'user', text }])
    const cur = editRef.current
    const local = interpretPrompt(text, cur.adj)
    const fullyUnderstood = local.applied.length > 0 && local.unknown.length === 0
    const geometryOnly = local.reset || local.applied.every((a) => /^(Rotate|Flip)/.test(a))

    if (fullyUnderstood && (!caps.generative || geometryOnly)) {
      commit({ ...cur, adj: local.adjustments })
      say('Done! Here is your edit.', { chips: local.applied })
      return
    }

    setBusy(true)
    const problems = []
    try {
      if (caps.generative) {
        try {
          const snap = snapshot(cur.base, cur.adj, 2048)
          const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: text, image: toDataUrl(snap), width: snap.width, height: snap.height }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
          const img = await loadDataUrl(data.image)
          commit({ base: img, adj: DEFAULT_ADJUSTMENTS })
          say(data.reply || 'Done! I edited your photo as you asked.', { chips: ['Generative AI edit'] })
          return
        } catch (e) {
          problems.push(e.message)
        }
      }

      if (caps.ai) {
        try {
          const res = await fetch('/api/interpret', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: text, current: cur.adj, image: toDataUrl(snapshot(cur.base, cur.adj)) }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
          const { reply, limitation, ...values } = data
          commit({ ...cur, adj: clampAdjustments({ ...cur.adj, ...values, rotate: Math.round(values.rotate / 90) * 90 }) })
          say(reply + (limitation ? `\n\n⚠️ ${limitation}` : ''), { chips: ['AI edit'] })
          return
        } catch (e) {
          problems.push(e.message)
        }
      }

      if (local.applied.length > 0) {
        commit({ ...cur, adj: local.adjustments })
        say('Done! I applied the parts I understood.', { chips: local.applied })
      } else {
        const stats = imageStats(snapshot(cur.base, cur.adj, 256))
        const enhanced = autoEnhance(cur.adj, stats, text)
        commit({ ...cur, adj: enhanced.adjustments })
        say('I enhanced your photo to match your request.', { chips: enhanced.notes })
      }
      if (problems.length) notify(`AI unavailable – used offline editing (${problems[0]})`, 'error')
    } finally {
      setBusy(false)
    }
  }

  function resetAll() {
    commit({ base: photo.img, adj: DEFAULT_ADJUSTMENTS })
    say('Back to your original photo.')
  }

  function newPhoto() {
    fileRef.current?.click()
  }

  const modeLabel = caps.generative ? 'Generative AI' : caps.ai ? 'AI mode' : 'Smart mode'

  return (
    <div
      className="app"
      onDragOver={(e) => {
        if (!photo) return
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragOver(false)}
      onDrop={(e) => {
        if (!photo) return
        e.preventDefault()
        setDragOver(false)
        const f = e.dataTransfer.files?.[0]
        if (f) handleFile(f)
      }}
    >
      <div className="bg-orbs" aria-hidden="true">
        <span />
        <span />
        <span />
        <i className="bg-grid" />
      </div>

      <header className={`topbar ${photo ? 'in-editor' : ''}`}>
        <button className="brand-btn" onClick={() => setPhoto(null)} aria-label="Home">
          <Logo size={38} />
        </button>
        {photo && (
          <div className="top-actions">
            <button className="btn btn-ghost hide-sm" onClick={newPhoto} disabled={busy}>
              <Icon name="image" size={18} /> New photo
            </button>
            <button className="btn btn-primary" onClick={() => setDownloadOpen(true)} disabled={busy}>
              <Icon name="download" size={18} /> <span className="hide-xs">Download</span>
            </button>
          </div>
        )}
      </header>

      <input
        ref={fileRef}
        type="file"
        hidden
        accept="image/*,.heic,.heif,.tif,.tiff,.cr2,.cr3,.nef,.arw,.dng,.raf,.orf,.rw2,.pef,.srw"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = ''
        }}
      />

      {!photo || !edit ? (
        <Landing onFile={handleFile} loading={loading} error={error} />
      ) : (
        <main className="editor">
          <section className="stage">
            <div className="toolbar glass">
              <button className="icon-btn" onClick={undo} disabled={!past.length || busy} data-tip="Undo (Ctrl+Z)" aria-label="Undo">
                <Icon name="undo" />
              </button>
              <button className="icon-btn" onClick={redo} disabled={!future.length || busy} data-tip="Redo (Ctrl+Y)" aria-label="Redo">
                <Icon name="redo" />
              </button>
              <span className="divider" />
              <button className={`icon-btn ${compare ? 'active' : ''}`} onClick={() => setCompare((c) => !c)} data-tip="Before / after" aria-label="Compare">
                <Icon name="compare" />
              </button>
              <button className={`icon-btn ${sheetOpen ? 'active' : ''}`} onClick={() => setSheetOpen(true)} data-tip="Fine-tune" aria-label="Fine-tune">
                <Icon name="sliders" />
              </button>
              <button className="icon-btn" onClick={resetAll} disabled={busy} data-tip="Reset to original" aria-label="Reset">
                <Icon name="reset" />
              </button>
              <button className="icon-btn show-sm" onClick={newPhoto} disabled={busy} data-tip="New photo" aria-label="New photo">
                <Icon name="image" />
              </button>
            </div>
            <Stage base={edit.base} adj={edit.adj} original={photo.img} compare={compare} busy={busy} revealKey={revealKey} />
            {loading && <div className="stage-loading glass">Opening {loading}…</div>}
          </section>

          <aside className="side glass">
            <ChatPanel messages={messages} onSubmit={handlePrompt} busy={busy} modeLabel={modeLabel} />
          </aside>
        </main>
      )}

      {photo && edit && (
        <>
          <AdjustSheet
            open={sheetOpen}
            adj={edit.adj}
            onClose={() => setSheetOpen(false)}
            onStart={() => {
              const prev = editRef.current
              setPast((p) => [...p.slice(-30), prev])
            }}
            onChange={(adj) => {
              setFuture([])
              setEdit((e) => ({ ...e, adj }))
            }}
            onCommit={commitAdj}
          />
          <DownloadDialog open={downloadOpen} onClose={() => setDownloadOpen(false)} base={edit.base} adj={edit.adj} name={photo.name} notify={notify} />
        </>
      )}

      {dragOver && (
        <div className="drop-overlay">
          <Icon name="upload" size={40} />
          <p>Drop to open this photo</p>
        </div>
      )}
      <Toasts toasts={toasts} />
    </div>
  )
}
