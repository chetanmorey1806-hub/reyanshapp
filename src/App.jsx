import { useCallback, useEffect, useRef, useState } from 'react'
import Logo from './components/Logo.jsx'
import Icon from './components/Icons.jsx'
import Landing from './components/Landing.jsx'
import Stage from './components/Stage.jsx'
import ChatPanel from './components/ChatPanel.jsx'
import { AdjustPanel, CropPanel, FiltersPanel, FramePanel, TextPanel } from './components/PhotoPanels.jsx'
import DownloadDialog from './components/DownloadDialog.jsx'
import Toasts from './components/Toasts.jsx'
import Splash from './components/Splash.jsx'
import VideoStudio from './video/VideoStudio.jsx'
import { DEFAULT_ADJUSTMENTS, centerCrop, clampAdjustments } from './utils/adjustments.js'
import { interpretPrompt } from './utils/promptParser.js'
import { loadAnyImage } from './utils/imageLoader.js'
import { autoEnhance, imageStats, snapshot, toDataUrl } from './utils/analyze.js'
import { computeLayout, exportImage } from './utils/renderer.js'

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

const TOOLS = [
  { id: 'ai', icon: 'sparkle', label: 'AI' },
  { id: 'adjust', icon: 'sliders', label: 'Adjust' },
  { id: 'filters', icon: 'filter', label: 'Filters' },
  { id: 'crop', icon: 'crop', label: 'Crop' },
  { id: 'text', icon: 'type', label: 'Text' },
  { id: 'frame', icon: 'frame', label: 'Frame' },
]

// One-tap AI tools (sent to the AI exactly like a typed prompt)
const AI_TOOLS = [
  { emoji: '🪄', label: 'Auto enhance', prompt: 'Make this photo look professionally edited: fix exposure, colours, contrast and sharpness naturally' },
  { emoji: '✂️', label: 'Remove background', prompt: 'Remove the background and replace it with a clean pure white studio background, keep the subject exactly the same' },
  { emoji: '🧹', label: 'Remove objects', prompt: 'Remove distracting people and objects from the background, keep the main subject exactly unchanged' },
  { emoji: '🌅', label: 'Change sky', prompt: 'Replace the sky with a beautiful golden sunset sky and match the lighting naturally' },
  { emoji: '✨', label: 'Skin retouch', prompt: 'Retouch the skin naturally: remove blemishes and even the skin tone while keeping texture and identity' },
  { emoji: '🌫️', label: 'Blur background', prompt: 'Blur the background like a professional portrait lens (bokeh), keep the subject sharp' },
  { emoji: '🖼️', label: 'Restore old photo', prompt: 'Restore this old photo: remove scratches, dust and noise, improve sharpness and faded colours' },
  { emoji: '🎨', label: 'Colourise', prompt: 'Colourise this black and white photo with natural, realistic colours' },
  { emoji: '🔍', label: 'Enhance detail', prompt: 'Increase fine detail and sharpness, remove noise, make it look high resolution' },
]

const SUGGESTIONS = [
  'Make it bright and warm',
  'Wedding look, soft & warm',
  'Change the background to a beach',
  'text "Happy Birthday" at top',
  'Crop square for Instagram',
  'थोडा उजेड वाढव आणि रंग जास्त',
  'Cinematic look',
  'Black and white, strong contrast',
]

const TEXT_SIZE = { small: 0.05, medium: 0.08, large: 0.12 }
const TEXT_Y = { top: 0.12, center: 0.5, bottom: 0.86 }

export default function App() {
  const [splash, setSplash] = useState(true)
  const hideSplash = useCallback(() => setSplash(false), [])
  const [mode, setMode] = useState('home') // home | photo | video
  const [videoOpened, setVideoOpened] = useState(false)
  const [videoInbox, setVideoInbox] = useState([])
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
  const [tool, setTool] = useState('ai')
  const [selectedText, setSelectedText] = useState(null)
  const [cropDraft, setCropDraft] = useState(null)
  const [cropAspect, setCropAspect] = useState('Free')
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
    setPast((p) => [...p.slice(-40), prev])
    setFuture([])
    setEdit(next)
    editRef.current = next // keep ref in sync for back-to-back commits
    setRevealKey((k) => k + 1)
  }, [])
  const commitAdj = useCallback((adj) => commit({ ...editRef.current, adj: clampAdjustments(adj) }), [commit])

  // slider / drag gestures: one history entry per gesture, live preview while moving
  const beginLive = useCallback(() => {
    const prev = editRef.current
    setPast((p) => [...p.slice(-40), prev])
    setFuture([])
  }, [])
  const live = useCallback((adj) => {
    const next = { ...editRef.current, adj }
    editRef.current = next
    setEdit(next)
  }, [])

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
      if (mode !== 'photo' || !(e.ctrlKey || e.metaKey) || /TEXTAREA|INPUT|SELECT/.test(e.target.tagName)) return
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
  }, [undo, redo, mode])

  // ---- open files -------------------------------------------------------
  function openFiles(files) {
    const list = Array.from(files || [])
    if (!list.length) return
    const hasVideo = list.some((f) => f.type.startsWith('video/') || /\.(mp4|mov|webm|m4v|mkv|avi|3gp)$/i.test(f.name))
    if (hasVideo || list.length > 1) openVideo(list)
    else handleFile(list[0])
  }

  function openVideo(files = []) {
    setVideoOpened(true)
    if (files.length) setVideoInbox((q) => [...q, ...files])
    setMode('video')
  }

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
      setTool('ai')
      setSelectedText(null)
      setMode('photo')
      setMessages([
        {
          id: nextId(),
          role: 'bot',
          text: `Your photo is ready (${w}×${h}). Tell me what to change, in English, मराठी or हिंदी (type or speak 🎤). For example “make it warm and cinematic”, “background badal” or “थोडा उजेड वाढव”. You can also use the tools on the left to edit by hand.`,
        },
      ])
    } catch (e) {
      setError(e.message)
      notify(e.message, 'error')
    } finally {
      setLoading('')
    }
  }

  // ---- AI helpers -----------------------------------------------------------
  const frameSize = (base, adj) => computeLayout(base, { ...adj, crop: null, frame: 0 })

  function resolveCrop(adj, base, aspect) {
    if (!aspect || aspect === 'keep') return adj
    if (aspect === 'none') return { ...adj, crop: null }
    const { fw, fh } = frameSize(base, adj)
    return { ...adj, crop: centerCrop(aspect, fw, fh) }
  }

  async function generative(prompt, cur) {
    // keep text layers and the border editable: send the photo without them
    const snap = snapshot(cur.base, { ...cur.adj, texts: [], frame: 0 }, 2048)
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, image: toDataUrl(snap), width: snap.width, height: snap.height }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    const img = await loadDataUrl(data.image)
    commit({ base: img, adj: { ...DEFAULT_ADJUSTMENTS, texts: cur.adj.texts, frame: cur.adj.frame, frameColor: cur.adj.frameColor } })
    return data
  }

  function applyClaude(data, cur) {
    const { reply, limitation, useGenerative, generativePrompt, cropAspect, addTexts, removeAllTexts, ...values } = data
    let adj = { ...cur.adj, ...values, rotate: Math.round((values.rotate ?? 0) / 90) * 90 }
    adj = resolveCrop(adj, cur.base, cropAspect)
    const base = removeAllTexts ? [] : cur.adj.texts || []
    const added = (addTexts || []).map((t, i) => ({
      id: `ai${Date.now()}${i}`,
      text: t.text,
      x: 0.5,
      y: TEXT_Y[t.position] ?? 0.86,
      size: TEXT_SIZE[t.size] ?? 0.08,
      color: t.color || '#ffffff',
      font: t.font || 'Playfair Display',
      weight: 700,
      italic: false,
      shadow: true,
      opacity: 100,
    }))
    adj.texts = [...base, ...added]
    commit({ ...cur, adj: clampAdjustments(adj) })
    return reply + (limitation ? `\n\n⚠️ ${limitation}` : '')
  }

  // ---- prompt → edit ----------------------------------------------------
  // 1. Reset / rotate / flip and (without generative AI) known looks → instant, offline
  // 2. Claude reads the photo + prompt and routes it: adjustments, text, crop… or generative
  // 3. Gemini generative edit → anything: remove objects, change background, retouch…
  // 4. Offline parser / auto-enhance → every prompt still edits the photo
  async function handlePrompt(text) {
    setMessages((m) => [...m, { id: nextId(), role: 'user', text }])
    const cur = editRef.current
    const local = interpretPrompt(text, cur.adj)
    const fullyUnderstood = local.applied.length > 0 && local.unknown.length === 0
    const geometryOnly = local.applied.length > 0 && local.applied.every((a) => /^(Rotate|Flip|Crop|Text)/.test(a))
    const applyLocal = (msg) => {
      const { _cropAspect, ...adj } = local.adjustments
      commit({ ...cur, adj: resolveCrop(adj, cur.base, _cropAspect) })
      say(msg, { chips: local.applied })
    }

    if (local.reset || (fullyUnderstood && (geometryOnly || !caps.generative))) {
      applyLocal(local.reset ? 'Back to the original look.' : 'Done! Here is your edit.')
      return
    }

    setBusy(true)
    const problems = []
    try {
      if (caps.ai) {
        try {
          const res = await fetch('/api/interpret', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: text, current: { ...cur.adj, texts: (cur.adj.texts || []).map((t) => t.text) }, image: toDataUrl(snapshot(cur.base, cur.adj)) }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
          if (data.useGenerative && caps.generative) {
            const g = await generative(data.generativePrompt || text, cur)
            say(data.reply || g.reply || 'Done! I edited your photo as you asked.', { chips: ['Generative AI edit'] })
          } else {
            say(applyClaude(data, cur), { chips: ['AI edit'] })
          }
          return
        } catch (e) {
          problems.push(e.message)
        }
      }

      if (caps.generative) {
        try {
          const g = await generative(text, cur)
          say(g.reply || 'Done! I edited your photo as you asked.', { chips: ['Generative AI edit'] })
          return
        } catch (e) {
          problems.push(e.message)
        }
      }

      if (local.applied.length > 0) {
        applyLocal(local.unknown.length ? 'Done! I applied the parts I understood.' : 'Done! Here is your edit.')
      } else {
        const stats = imageStats(snapshot(cur.base, cur.adj, 256))
        const enhanced = autoEnhance(cur.adj, stats, text)
        commit({ ...cur, adj: enhanced.adjustments })
        say(
          caps.generative || caps.ai
            ? 'I enhanced your photo to match your request.'
            : 'I enhanced your photo to match your request. For content changes (remove objects, change background…) add a GEMINI_API_KEY in .env.',
          { chips: enhanced.notes },
        )
      }
      if (problems.length) notify(`AI unavailable – used offline editing (${problems[0]})`, 'error')
    } finally {
      setBusy(false)
    }
  }

  function autoAdjust() {
    const cur = editRef.current
    const stats = imageStats(snapshot(cur.base, cur.adj, 256))
    commitAdj(autoEnhance(cur.adj, stats, 'natural').adjustments)
    notify('Auto enhance applied', 'success')
  }

  // ---- tools ---------------------------------------------------------------
  function switchTool(next) {
    if (tool === 'crop' && next !== 'crop') applyCrop(cropDraft, false)
    if (next === 'crop') {
      setCropDraft(edit.adj.crop ?? { x: 0, y: 0, w: 1, h: 1 })
      setCropAspect('Free')
      setCompare(false)
    }
    setTool(next)
  }

  function applyCrop(draft, leave = true) {
    if (!draft) return
    const full = draft.w > 0.995 && draft.h > 0.995
    const next = full ? null : draft
    if (JSON.stringify(next) !== JSON.stringify(edit.adj.crop ?? null)) commitAdj({ ...edit.adj, crop: next })
    if (leave) setTool('adjust')
  }

  function resetAll() {
    commit({ base: photo.img, adj: DEFAULT_ADJUSTMENTS })
    say('Back to your original photo.')
  }

  async function sendToReel() {
    try {
      const blob = await exportImage(edit.base, edit.adj, 'image/jpeg', 0.92, 2160)
      openVideo([new File([blob], `${photo.name}-edited.jpg`, { type: 'image/jpeg' })])
      notify('Photo added to your video / reel', 'success')
    } catch (e) {
      notify(e.message, 'error')
    }
  }

  const modeLabel = caps.generative && caps.ai ? 'AI Pro' : caps.generative ? 'Generative AI' : caps.ai ? 'AI mode' : 'Smart mode'
  const frame = photo && edit ? frameSize(edit.base, edit.adj) : null
  const cropRatio = cropAspect === 'Free' ? null : cropAspect === 'Original' ? frame?.fw / frame?.fh : (([a, b]) => a / b)(cropAspect.split(':').map(Number))

  const panelProps = { adj: edit?.adj, onStart: beginLive, onLive: live, onCommit: commitAdj }

  return (
    <div
      className="app"
      onDragOver={(e) => {
        if (mode !== 'photo') return
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragOver(false)}
      onDrop={(e) => {
        if (mode !== 'photo') return
        e.preventDefault()
        setDragOver(false)
        openFiles(e.dataTransfer.files)
      }}
    >
      <div className="bg-orbs" aria-hidden="true">
        <span />
        <span />
        <span />
        <i className="bg-grid" />
      </div>

      <header className={`topbar ${mode !== 'home' ? 'in-editor' : ''}`}>
        <button className="brand-btn" onClick={() => setMode('home')} aria-label="Home">
          <Logo size={36} />
        </button>
        {mode !== 'home' && (
          <nav className="mode-switch" aria-label="Editor">
            <button className={mode === 'photo' ? 'active' : ''} onClick={() => (photo ? setMode('photo') : fileRef.current?.click())}>
              <Icon name="photo" size={16} /> <span>Photo</span>
            </button>
            <button className={mode === 'video' ? 'active' : ''} onClick={() => openVideo()}>
              <Icon name="film" size={16} /> <span>Video & Reels</span>
            </button>
            <span className={`mode-indicator ${mode}`} />
          </nav>
        )}
        <div className="top-actions">
          {mode === 'photo' && photo && (
            <>
              <button className="btn btn-ghost hide-sm" onClick={() => fileRef.current?.click()} disabled={busy}>
                <Icon name="image" size={18} /> New photo
              </button>
              <button className="btn btn-ghost hide-sm" onClick={sendToReel} disabled={busy}>
                <Icon name="film" size={18} /> Add to reel
              </button>
              <button className="btn btn-primary" onClick={() => setDownloadOpen(true)} disabled={busy}>
                <Icon name="download" size={18} /> <span className="hide-xs">Download</span>
              </button>
            </>
          )}
        </div>
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

      {mode === 'home' && <Landing onFiles={openFiles} onVideo={() => openVideo()} loading={loading} error={error} />}

      {mode === 'photo' && photo && edit && (
        <main className="editor">
          <nav className="tool-rail glass" aria-label="Tools">
            {TOOLS.map((t) => (
              <button key={t.id} className={`rail-btn ${tool === t.id ? 'active' : ''}`} onClick={() => switchTool(t.id)} disabled={busy}>
                <Icon name={t.icon} size={20} />
                <span>{t.label}</span>
              </button>
            ))}
          </nav>

          <section className="stage">
            <div className="toolbar glass">
              <button className="icon-btn" onClick={undo} disabled={!past.length || busy} data-tip="Undo (Ctrl+Z)" aria-label="Undo">
                <Icon name="undo" />
              </button>
              <button className="icon-btn" onClick={redo} disabled={!future.length || busy} data-tip="Redo (Ctrl+Y)" aria-label="Redo">
                <Icon name="redo" />
              </button>
              <span className="divider" />
              <button className={`icon-btn ${compare ? 'active' : ''}`} onClick={() => setCompare((c) => !c)} disabled={tool === 'crop'} data-tip="Before / after" aria-label="Compare">
                <Icon name="compare" />
              </button>
              <button className="icon-btn" onClick={resetAll} disabled={busy} data-tip="Reset to original" aria-label="Reset">
                <Icon name="reset" />
              </button>
              <button className="icon-btn show-sm" onClick={sendToReel} disabled={busy} data-tip="Add to reel" aria-label="Add to reel">
                <Icon name="film" />
              </button>
              <button className="icon-btn show-sm" onClick={() => fileRef.current?.click()} disabled={busy} data-tip="New photo" aria-label="New photo">
                <Icon name="image" />
              </button>
            </div>
            <Stage
              base={edit.base}
              adj={edit.adj}
              original={photo.img}
              compare={compare}
              busy={busy}
              revealKey={revealKey}
              tool={tool}
              crop={cropDraft}
              setCrop={setCropDraft}
              cropRatio={cropRatio}
              selectedText={selectedText}
              setSelectedText={(id) => {
                setSelectedText(id)
                if (id && tool !== 'text') setTool('text')
              }}
              onTextStart={beginLive}
              onTextMove={(id, x, y) => live({ ...editRef.current.adj, texts: editRef.current.adj.texts.map((t) => (t.id === id ? { ...t, x, y } : t)) })}
              onTextEnd={() => {}}
            />
            {loading && <div className="stage-loading glass">Opening {loading}…</div>}
          </section>

          <aside className="side glass" key={tool}>
            {tool === 'ai' && <ChatPanel messages={messages} onSubmit={handlePrompt} busy={busy} modeLabel={modeLabel} suggestions={SUGGESTIONS} tools={AI_TOOLS} />}
            {tool === 'adjust' && <AdjustPanel {...panelProps} onAuto={autoAdjust} />}
            {tool === 'filters' && <FiltersPanel {...panelProps} base={edit.base} notify={notify} />}
            {tool === 'crop' && (
              <CropPanel
                {...panelProps}
                frame={frame}
                draft={cropDraft}
                setDraft={setCropDraft}
                aspect={cropAspect}
                setAspect={setCropAspect}
                onCommit={(adj) => {
                  commitAdj(adj)
                  if (adj.rotate !== edit.adj.rotate) setCropDraft({ x: 0, y: 0, w: 1, h: 1 })
                }}
                onApply={applyCrop}
              />
            )}
            {tool === 'text' && <TextPanel {...panelProps} selected={selectedText} setSelected={setSelectedText} />}
            {tool === 'frame' && <FramePanel {...panelProps} />}
          </aside>
        </main>
      )}

      {videoOpened && (
        <div className="video-host" hidden={mode !== 'video'}>
          <VideoStudio active={mode === 'video'} inbox={videoInbox} clearInbox={() => setVideoInbox([])} caps={caps} notify={notify} />
        </div>
      )}

      {mode === 'photo' && photo && edit && (
        <DownloadDialog open={downloadOpen} onClose={() => setDownloadOpen(false)} base={edit.base} adj={edit.adj} name={photo.name} notify={notify} />
      )}

      {dragOver && (
        <div className="drop-overlay">
          <Icon name="upload" size={40} />
          <p>Drop to open this photo</p>
        </div>
      )}
      <Toasts toasts={toasts} />
      {splash && <Splash onDone={hideSplash} />}
    </div>
  )
}
