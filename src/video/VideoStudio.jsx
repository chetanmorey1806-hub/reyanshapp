import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../components/Icons.jsx'
import ChatPanel from '../components/ChatPanel.jsx'
import { loadAnyImage } from '../utils/imageLoader.js'
import { ASPECTS, DEFAULT_PROJECT, Mixer, buildTimeline, clipLength, drawFrame, exportVideo, loadAudio, loadVideo, pauseAll, syncMedia, thumbnail } from './engine.js'
import { generateMusic } from './music.js'
import { interpretVideoPrompt } from './videoPrompt.js'
import { ClipPanel, ExportDialog, MusicPanel, StylePanel, TextTrackPanel, Timeline, fmt } from './VideoPanels.jsx'

let cid = 0
const newId = (p = 'c') => `${p}${Date.now().toString(36)}${cid++}`
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const VIDEO_RE = /\.(mp4|mov|webm|m4v|mkv|avi|3gp)$/i

const TABS = [
  { id: 'ai', icon: 'sparkle', label: 'AI' },
  { id: 'clip', icon: 'scissors', label: 'Clip' },
  { id: 'text', icon: 'type', label: 'Text' },
  { id: 'music', icon: 'music', label: 'Music' },
  { id: 'style', icon: 'filter', label: 'Style' },
]

const SUGGESTIONS = [
  'Make a wedding reel with romantic song',
  'Instagram reel, 15 seconds, fast transitions',
  'Slow motion, cinematic look',
  'Add text "Happy Birthday" with typing animation',
  'Diwali reel with dhol music',
  'वाढदिवसाचा रील बनव गाण्यासोबत',
  'Mute original sound',
  'YouTube video 16:9, smooth fade',
]

const TOOLS = [
  { emoji: '💍', label: 'Wedding reel', prompt: 'Make a wedding reel: 9:16, wedding look, smooth fade transitions, Ken Burns, romantic music' },
  { emoji: '🎂', label: 'Birthday reel', prompt: 'Make a birthday reel with upbeat music, vivid colours and the text "Happy Birthday" at the start' },
  { emoji: '🪔', label: 'Festive reel', prompt: 'Make a festive reel with dhol music, golden look and flash transitions' },
  { emoji: '✈️', label: 'Travel video', prompt: 'Make a travel video, landscape look, calm music, smooth transitions' },
  { emoji: '🎬', label: 'Cinematic', prompt: 'Cinematic look with slow motion, zoom transitions and cinematic music' },
  { emoji: '⚡', label: '15s reel', prompt: 'Make a 15 second Instagram reel with fast slide transitions and upbeat music' },
]

const TEXT_Y = { top: 0.14, center: 0.5, bottom: 0.84 }
const TEXT_SIZE = { small: 0.05, medium: 0.075, large: 0.1 }

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Image could not be opened'))
    img.src = src
  })
}

export default function VideoStudio({ active, inbox, clearInbox, caps, notify }) {
  const [clips, setClips] = useState([])
  const [project, setProject] = useState(DEFAULT_PROJECT)
  const [selected, setSelected] = useState(null)
  const [selectedText, setSelectedText] = useState(null)
  const [tab, setTab] = useState('ai')
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loadingCount, setLoadingCount] = useState(0)
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(null)
  const [messages, setMessages] = useState([
    {
      id: 'hello',
      role: 'bot',
      text: 'Welcome to the Video & Reels studio 🎬\nAdd photos or videos, then tell me what to make, e.g. “wedding reel with romantic song”, “15 second Instagram reel” or “वाढदिवसाचा व्हिडिओ बनव”. You can also edit everything by hand with the tabs above.',
    },
  ])

  const canvasRef = useRef(null)
  const fileRef = useRef(null)
  const mixerRef = useRef(null)
  const tRef = useRef(0)
  const playingRef = useRef(false)
  const dirtyRef = useRef(true)
  const exportingRef = useRef(false)
  const abortRef = useRef(null)
  const clipsRef = useRef(clips)
  const projectRef = useRef(project)
  clipsRef.current = clips
  projectRef.current = project

  const timeline = useMemo(() => buildTimeline(clips, project), [clips, project])
  const tlRef = useRef(timeline)
  tlRef.current = timeline
  const markDirty = useCallback(() => {
    dirtyRef.current = true
  }, [])
  useEffect(() => {
    markDirty()
  }, [timeline, markDirty])

  const getMixer = () => (mixerRef.current ??= new Mixer())
  const say = (text, extra = {}) => setMessages((m) => [...m, { id: newId('m'), role: 'bot', text, ...extra }])

  // ---- render loop -------------------------------------------------------------------
  useEffect(() => {
    let raf
    let last = performance.now()
    let lastUi = 0
    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      const dt = (now - last) / 1000
      last = now
      if (exportingRef.current) return
      const tl = tlRef.current
      if (playingRef.current) {
        tRef.current = Math.min(tl.total, tRef.current + dt)
        if (tRef.current >= tl.total) {
          playingRef.current = false
          setPlaying(false)
          pauseAll(clipsRef.current, projectRef.current)
        }
      }
      if (playingRef.current || dirtyRef.current) {
        dirtyRef.current = false
        const c = canvasRef.current
        if (c) {
          syncMedia(tl, projectRef.current, tRef.current, playingRef.current, mixerRef.current)
          drawFrame(c.getContext('2d'), c.width, c.height, tl, projectRef.current, tRef.current)
        }
      }
      if (now - lastUi > 90) {
        lastUi = now
        setT((old) => (Math.abs(old - tRef.current) > 0.005 ? tRef.current : old))
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  // stop playback when leaving the studio
  useEffect(() => {
    if (!active && playingRef.current) togglePlay()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  // canvas size follows the format (half resolution for a smooth preview)
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const [w, h] = ASPECTS[project.aspect]
    c.width = w / 2
    c.height = h / 2
    markDirty()
  }, [project.aspect, markDirty])

  // re-draw when fonts load (text)
  useEffect(() => {
    document.fonts?.addEventListener?.('loadingdone', markDirty)
    window.addEventListener('brandchange', markDirty)
    return () => {
      document.fonts?.removeEventListener?.('loadingdone', markDirty)
      window.removeEventListener('brandchange', markDirty)
    }
  }, [markDirty])

  function seek(v) {
    tRef.current = clamp(v, 0, tlRef.current.total)
    setT(tRef.current)
    markDirty()
  }

  async function togglePlay() {
    if (playingRef.current) {
      playingRef.current = false
      setPlaying(false)
      pauseAll(clipsRef.current, projectRef.current)
      markDirty()
      return
    }
    if (!tlRef.current.total) return
    await getMixer().resume()
    if (tRef.current >= tlRef.current.total - 0.05) tRef.current = 0
    playingRef.current = true
    setPlaying(true)
  }

  // space = play / pause
  useEffect(() => {
    const onKey = (e) => {
      if (!active || e.code !== 'Space' || /TEXTAREA|INPUT|SELECT|BUTTON/.test(e.target.tagName)) return
      e.preventDefault()
      togglePlay()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  // ---- media -----------------------------------------------------------------------
  const fitFor = (w, h) => {
    const [pw, ph] = ASPECTS[projectRef.current.aspect]
    return Math.abs(Math.log(w / h / (pw / ph))) > 0.35 ? 'blur' : 'cover'
  }

  async function makeClip(file) {
    const isVideo = file.type.startsWith('video/') || VIDEO_RE.test(file.name)
    const name = file.name.replace(/\.[^.]+$/, '')
    if (isVideo) {
      const el = await loadVideo(file)
      let dur = el.duration
      if (!Number.isFinite(dur)) {
        el.currentTime = 1e7 // some WEBM files report Infinity until seeked to the end
        await new Promise((r) => el.addEventListener('seeked', r, { once: true }))
        dur = el.duration
      }
      const thumb = await thumbnail(el, Math.min(1, dur / 3))
      el.currentTime = 0
      el.addEventListener('seeked', markDirty)
      return { id: newId(), kind: 'video', name, el, thumb, srcDur: dur, in: 0, out: dur, speed: 1, volume: 100, fit: fitFor(el.videoWidth, el.videoHeight) }
    }
    const { img } = await loadAnyImage(file)
    const thumb = await thumbnail(img)
    return { id: newId(), kind: 'image', name, el: img, thumb, dur: 2.5, kenBurns: true, fit: fitFor(img.naturalWidth, img.naturalHeight) }
  }

  async function addFiles(files) {
    const list = Array.from(files).filter((f) => /^(image|video)\//.test(f.type) || VIDEO_RE.test(f.name) || /\.(heic|heif|tiff?|cr2|cr3|nef|arw|dng|raf|orf|rw2|pef|srw)$/i.test(f.name))
    if (!list.length) return
    setLoadingCount((n) => n + list.length)
    let first = null
    for (const file of list) {
      try {
        const clip = await makeClip(file)
        first ??= clip.id
        setClips((c) => [...c, clip])
      } catch (e) {
        notify(e.message, 'error')
      } finally {
        setLoadingCount((n) => n - 1)
      }
    }
    if (first) {
      setSelected((s) => s ?? first)
      markDirty()
    }
  }

  useEffect(() => {
    if (inbox.length) {
      addFiles(inbox)
      clearInbox()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inbox])

  async function cloneClip(c, patch = {}) {
    if (c.kind !== 'video') return { ...c, ...patch, id: newId() }
    const el = document.createElement('video')
    el.preload = 'auto'
    el.playsInline = true
    el.src = c.el.src
    await new Promise((r) => (el.onloadeddata = r))
    el.addEventListener('seeked', markDirty)
    return { ...c, ...patch, el, id: newId() }
  }

  // ---- clip edits -----------------------------------------------------------------------
  const updateClip = (id, patch) => setClips((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  const selClip = clips.find((c) => c.id === selected)
  const selIndex = clips.findIndex((c) => c.id === selected)

  function moveClip(dir) {
    setClips((cs) => {
      const i = cs.findIndex((c) => c.id === selected)
      const j = i + dir
      if (i < 0 || j < 0 || j >= cs.length) return cs
      const next = [...cs]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  function reorder(dragId, targetId) {
    setClips((cs) => {
      const from = cs.findIndex((c) => c.id === dragId)
      const to = cs.findIndex((c) => c.id === targetId)
      if (from < 0 || to < 0) return cs
      const next = [...cs]
      const [m] = next.splice(from, 1)
      next.splice(to, 0, m)
      return next
    })
  }

  async function splitClip() {
    const it = timeline.items.find((x) => x.clip.id === selected)
    if (!it) return
    const local = tRef.current - it.start
    if (local < 0.2 || local > it.len - 0.2) return notify('Move the playhead inside the selected clip to split it', 'error')
    const c = it.clip
    let a, b
    if (c.kind === 'video') {
      const cut = c.in + local * c.speed
      a = { ...c, out: cut }
      b = await cloneClip(c, { in: cut, transition: 'none' })
    } else {
      a = { ...c, dur: local }
      b = await cloneClip(c, { dur: c.dur - local, transition: 'none' })
    }
    setClips((cs) => cs.flatMap((x) => (x.id === c.id ? [a, b] : [x])))
    notify('Clip split at the playhead', 'success')
  }

  async function duplicateClip() {
    if (!selClip) return
    const copy = await cloneClip(selClip)
    setClips((cs) => cs.flatMap((x) => (x.id === selClip.id ? [x, copy] : [x])))
    setSelected(copy.id)
  }

  function deleteClip() {
    const c = selClip
    if (!c) return
    if (c.kind === 'video') c.el.pause()
    setClips((cs) => cs.filter((x) => x.id !== c.id))
    setSelected(clips[selIndex + 1]?.id ?? clips[selIndex - 1]?.id ?? null)
  }

  async function aiEditClip(prompt) {
    const c = selClip
    if (!c || c.kind !== 'image') return
    setBusy(true)
    try {
      if (!caps.generative) throw new Error('Generative AI is not set up. Add GEMINI_API_KEY in .env (or edit the photo in the Photo editor and use “Add to reel”).')
      const canvas = document.createElement('canvas')
      const s = Math.min(1, 2048 / Math.max(c.el.naturalWidth, c.el.naturalHeight))
      canvas.width = Math.round(c.el.naturalWidth * s)
      canvas.height = Math.round(c.el.naturalHeight * s)
      canvas.getContext('2d').drawImage(c.el, 0, 0, canvas.width, canvas.height)
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, image: canvas.toDataURL('image/jpeg', 0.9), width: canvas.width, height: canvas.height }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      const img = await loadImg(data.image)
      updateClip(c.id, { el: img, thumb: await thumbnail(img) })
      notify('Photo edited with AI', 'success')
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  // ---- text -----------------------------------------------------------------------------------
  function addText(layer = {}) {
    const total = tlRef.current.total || 3
    const start = clamp(tRef.current, 0, Math.max(0, total - 0.5))
    const tx = { id: newId('t'), text: 'Your title', start, end: Math.min(Math.max(total, start + 0.5), start + 3), position: 'center', anim: 'pop', x: 0.5, size: 0.08, color: '#ffffff', font: 'Playfair Display', weight: 700, shadow: true, opacity: 100, ...layer }
    setProject((p) => ({ ...p, texts: [...p.texts, tx] }))
    setSelectedText(tx.id)
    setTab('text')
  }
  const changeText = (id, patch) => setProject((p) => ({ ...p, texts: p.texts.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
  const deleteText = (id) => {
    setProject((p) => ({ ...p, texts: p.texts.filter((x) => x.id !== id) }))
    setSelectedText(null)
  }

  // ---- music ----------------------------------------------------------------------------------
  function setMusic(m) {
    const old = projectRef.current.music
    if (old?.el) {
      old.el.pause()
      if (old.generated) URL.revokeObjectURL(old.url)
    }
    setProject((p) => ({ ...p, music: m }))
  }

  async function pickMood(mood, volume = -1) {
    setBusy(true)
    try {
      const g = await generateMusic(mood, Math.max(20, tlRef.current.total + 3))
      const el = await loadAudio(g.url)
      setMusic({ ...g, el, volume: volume >= 0 ? volume : projectRef.current.music?.volume ?? 70, offset: 0, generated: true })
      return g.name
    } catch (e) {
      notify(`Music could not be created: ${e.message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function uploadSong(file) {
    try {
      const url = URL.createObjectURL(file)
      const el = await loadAudio(url)
      setMusic({ name: file.name.replace(/\.[^.]+$/, ''), url, el, duration: el.duration, volume: 80, offset: 0 })
      notify('Song added', 'success')
    } catch (e) {
      notify(e.message, 'error')
    }
  }

  // ---- AI / prompt → plan --------------------------------------------------------------------
  async function applyPlan(plan) {
    let next = clipsRef.current.map((c) => ({ ...c }))
    const p = { ...projectRef.current }
    if (plan.aspect && plan.aspect !== 'keep') p.aspect = plan.aspect
    if (plan.filter && plan.filter !== 'keep') p.filter = plan.filter
    if (plan.filterAmount >= 0) p.filterAmount = clamp(plan.filterAmount, 0, 150)
    if (plan.transition && plan.transition !== 'keep') {
      p.transition = plan.transition
      next.forEach((c) => delete c.transition)
    }
    if (plan.transitionDuration > 0) p.transitionDuration = clamp(plan.transitionDuration, 0.2, 2)
    if (plan.imageDuration > 0) next.forEach((c) => c.kind === 'image' && (c.dur = clamp(plan.imageDuration, 0.5, 20)))
    if (plan.speed > 0) next.forEach((c) => c.kind === 'video' && (c.speed = clamp(plan.speed, 0.25, 4)))
    if (plan.kenBurns && plan.kenBurns !== 'keep') next.forEach((c) => c.kind === 'image' && (c.kenBurns = plan.kenBurns === 'on'))
    if (plan.fit && plan.fit !== 'keep') next.forEach((c) => (c.fit = plan.fit))
    if (plan.order === 'reverse') next.reverse()
    if (plan.order === 'shuffle') next.sort(() => Math.random() - 0.5)

    // target length: spread the time over the photos (or trim videos)
    if (plan.targetDuration > 0 && next.length) {
      const td = p.transition === 'none' ? 0 : p.transitionDuration
      const imgs = next.filter((c) => c.kind === 'image')
      const vids = next.filter((c) => c.kind === 'video')
      const vidLen = vids.reduce((s, c) => s + clipLength(c), 0)
      const want = plan.targetDuration + td * (next.length - 1)
      if (imgs.length) imgs.forEach((c) => (c.dur = clamp((want - vidLen) / imgs.length, 0.6, 20)))
      else if (vidLen > want) {
        const f = want / vidLen
        vids.forEach((c) => (c.out = c.in + (c.out - c.in) * f))
      }
    }
    const total = buildTimeline(next, p).total

    if (plan.removeAllTexts) p.texts = []
    if (plan.addTexts?.length) {
      p.texts = [
        ...p.texts,
        ...plan.addTexts.map((x) => {
          const start = clamp(x.start ?? 0, 0, Math.max(0, total - 0.5))
          return {
            id: newId('t'),
            text: x.text,
            start,
            end: clamp(x.end > start ? x.end : start + 3, start + 0.5, Math.max(total, start + 0.5)),
            position: x.position || 'center',
            y: TEXT_Y[x.position] ?? 0.5,
            anim: x.animation || 'pop',
            x: 0.5,
            size: TEXT_SIZE[x.size] ?? 0.08,
            color: x.color || '#ffffff',
            font: x.font || 'Playfair Display',
            weight: 700,
            shadow: true,
            opacity: 100,
          }
        }),
      ]
    }
    if (plan.originalAudioVolume >= 0) p.clipVolume = clamp(plan.originalAudioVolume, 0, 100)
    if (plan.musicVolume >= 0 && p.music) p.music = { ...p.music, volume: clamp(plan.musicVolume, 0, 100) }
    setClips(next)
    setProject(p)
    projectRef.current = p
    if (plan.music === 'none') setMusic(null)
    else if (plan.music && plan.music !== 'keep') await pickMood(plan.music, plan.musicVolume)
    seek(0)
  }

  async function handlePrompt(text) {
    setMessages((m) => [...m, { id: newId('m'), role: 'user', text }])
    setBusy(true)
    try {
      const local = interpretVideoPrompt(text, { total: tlRef.current.total })
      if (caps.ai) {
        try {
          const summary = {
            format: projectRef.current.aspect,
            look: projectRef.current.filter,
            transition: projectRef.current.transition,
            transitionDuration: projectRef.current.transitionDuration,
            totalSeconds: Math.round(tlRef.current.total * 10) / 10,
            clips: clipsRef.current.map((c) => ({ kind: c.kind, name: c.name, seconds: Math.round(clipLength(c) * 10) / 10, ...(c.kind === 'video' ? { speed: c.speed, sourceSeconds: Math.round(c.srcDur) } : {}) })),
            texts: projectRef.current.texts.map((x) => ({ text: x.text, start: x.start, end: x.end })),
            music: projectRef.current.music?.name ?? null,
            musicVolume: projectRef.current.music?.volume ?? null,
            originalAudioVolume: projectRef.current.clipVolume,
          }
          const res = await fetch('/api/video-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: text, project: summary }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
          await applyPlan(data)
          say(data.reply + (data.limitation ? `\n\n⚠️ ${data.limitation}` : ''), { chips: ['AI edit'] })
          if (!clipsRef.current.length) say('Now add your photos or videos with “Add photos / videos” below. The settings are ready for them.')
          return
        } catch (e) {
          notify(`AI unavailable – used offline editing (${e.message})`, 'error')
        }
      }
      let { plan, applied } = local
      if (!applied.length) ({ plan, applied } = interpretVideoPrompt(`make a reel ${text}`, { total: tlRef.current.total }))
      await applyPlan(plan)
      say(clipsRef.current.length ? 'Done! Press ▶ to watch it.' : 'Settings applied. Now add your photos or videos with “Add photos / videos” below.', { chips: applied })
    } finally {
      setBusy(false)
    }
  }

  // ---- export -------------------------------------------------------------------------------
  async function doExport(quality) {
    if (playingRef.current) await togglePlay()
    const mixer = getMixer()
    exportingRef.current = true
    setExporting({ progress: 0 })
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const res = await exportVideo({ clips: clipsRef.current, project: projectRef.current, mixer, quality, onProgress: (p) => setExporting({ progress: p }), signal: ctrl.signal })
      if (res) {
        const url = URL.createObjectURL(res.blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `stories-by-reyansh-${projectRef.current.aspect.replace(':', 'x')}-${stamp()}.${res.ext}`
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 60000)
        notify(`Video exported (${res.width}×${res.height}, ${(res.blob.size / 1e6).toFixed(1)} MB)`, 'success')
      }
    } catch (e) {
      notify(`Export failed: ${e.message}`, 'error')
    } finally {
      exportingRef.current = false
      setExporting(null)
      setExportOpen(false)
      seek(0)
    }
  }

  const modeLabel = caps.ai ? 'AI Pro' : 'Smart mode'
  const [pw, ph] = ASPECTS[project.aspect]

  return (
    <div
      className="studio"
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onDrop={(e) => {
        if (!e.dataTransfer.files?.length) return
        e.preventDefault()
        addFiles(e.dataTransfer.files)
      }}
    >
      <section className="studio-stage">
        <div className="toolbar glass studio-bar">
          <span className="muted small hide-xs">Format</span>
          {Object.keys(ASPECTS).map((a) => (
            <button key={a} className={`fmt-btn ${project.aspect === a ? 'active' : ''}`} onClick={() => setProject((p) => ({ ...p, aspect: a }))}>
              {a}
            </button>
          ))}
          <span className="divider" />
          <button className="btn btn-primary btn-sm" onClick={() => setExportOpen(true)} disabled={!clips.length || busy}>
            <Icon name="download" size={16} /> Export
          </button>
        </div>

        <div className="player-area">
          <div className="player" style={{ aspectRatio: `${pw} / ${ph}` }}>
            <canvas ref={canvasRef} className="player-canvas" onClick={togglePlay} />
            {!clips.length && (
              <button className="player-empty" onClick={() => fileRef.current?.click()}>
                <span className="drop-icon">
                  <Icon name="film" size={24} />
                </span>
                <b>Add photos or videos</b>
                <small className="muted">Several photos → reel · videos → trim & join</small>
              </button>
            )}
            {busy && (
              <div className="magic-overlay">
                <div className="shimmer" />
                <div className="magic-label">
                  <span className="orb" /> Working on it…
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="transport glass">
          <button className="play-btn" onClick={togglePlay} disabled={!clips.length} aria-label={playing ? 'Pause' : 'Play'}>
            <Icon name={playing ? 'pause' : 'play'} size={18} />
          </button>
          <span className="time">
            {fmt(t)} <span className="muted">/ {fmt(timeline.total)}</span>
          </span>
          <input
            type="range"
            className="scrub"
            min={0}
            max={Math.max(0.01, timeline.total)}
            step={0.01}
            value={Math.min(t, timeline.total)}
            style={{ '--pct': `${timeline.total ? (t / timeline.total) * 100 : 0}%` }}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Seek"
          />
        </div>
      </section>

      <aside className="side glass studio-side">
        <div className="tabs">
          {TABS.map((x) => (
            <button key={x.id} className={`tab ${tab === x.id ? 'active' : ''}`} onClick={() => setTab(x.id)}>
              <Icon name={x.icon} size={16} />
              <span>{x.label}</span>
            </button>
          ))}
        </div>
        <div className="tab-body" key={tab}>
          {tab === 'ai' && <ChatPanel messages={messages} onSubmit={handlePrompt} busy={busy} modeLabel={modeLabel} suggestions={SUGGESTIONS} tools={TOOLS} title="AI Video Editor" subtitle="Describe the reel or video you want" placeholder="e.g. “wedding reel, romantic song, 30 sec”" />}
          {tab === 'clip' && (
            <ClipPanel
              clip={selClip}
              index={selIndex}
              count={clips.length}
              caps={caps}
              busy={busy}
              onChange={(patch) => updateClip(selected, patch)}
              onMove={moveClip}
              onSplit={splitClip}
              onDuplicate={duplicateClip}
              onDelete={deleteClip}
              onAiEdit={aiEditClip}
            />
          )}
          {tab === 'text' && <TextTrackPanel texts={project.texts} selected={selectedText} setSelected={setSelectedText} total={timeline.total} t={t} onAdd={() => addText()} onChange={changeText} onDelete={deleteText} />}
          {tab === 'music' && (
            <MusicPanel
              music={project.music}
              total={timeline.total}
              clipVolume={project.clipVolume}
              busy={busy}
              onMood={(m) => pickMood(m).then((n) => n && notify(`${n} added`, 'success'))}
              onUpload={uploadSong}
              onChange={(patch) => setProject((p) => ({ ...p, music: { ...p.music, ...patch } }))}
              onClipVolume={(v) => setProject((p) => ({ ...p, clipVolume: v }))}
              onRemove={() => setMusic(null)}
            />
          )}
          {tab === 'style' && <StylePanel project={project} clips={clips} onProject={(patch) => setProject((p) => ({ ...p, ...patch }))} onAllClips={(fn) => setClips((cs) => cs.map((c) => ({ ...c, ...(fn(c) || {}) })))} />}
        </div>
      </aside>

      <Timeline
        timeline={timeline}
        project={project}
        t={t}
        selected={selected}
        onSelect={(id) => {
          setSelected(id)
          setTab('clip')
          const it = timeline.items.find((x) => x.clip.id === id)
          if (it && (tRef.current < it.start || tRef.current >= it.end)) seek(it.start + Math.min(0.05, it.len / 2) + it.td)
        }}
        selectedText={selectedText}
        onSelectText={(id) => {
          setSelectedText(id)
          setTab('text')
        }}
        onSeek={seek}
        onReorder={reorder}
        onAdd={() => fileRef.current?.click()}
        loadingCount={loadingCount}
      />

      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        accept="image/*,video/*,.heic,.heif,.tif,.tiff,.cr2,.cr3,.nef,.arw,.dng,.mov,.mkv"
        onChange={(e) => {
          addFiles(e.target.files)
          e.target.value = ''
        }}
      />

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} total={timeline.total} project={project} exporting={exporting} onExport={doExport} onCancel={() => abortRef.current?.abort()} />
    </div>
  )
}
