// Video / reel engine: timeline maths, frame drawing (transitions, Ken Burns,
// filters, animated text), media + audio sync, and export to MP4/WebM.
// The same drawFrame() is used for the live preview and for the export.

import { cssFilter, drawOverlays, drawTexts, drawVignette } from '../utils/renderer.js'
import { drawWatermark } from '../utils/brand.js'
import { presetAdjustments } from '../utils/presets.js'

export const ASPECTS = {
  '9:16': [1080, 1920],
  '16:9': [1920, 1080],
  '1:1': [1080, 1080],
  '4:5': [1080, 1350],
}
export const TRANSITIONS = ['none', 'fade', 'slide', 'zoom', 'wipe', 'flash', 'blur']
export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]

export const DEFAULT_PROJECT = {
  aspect: '9:16',
  filter: 'Original',
  filterAmount: 100,
  transition: 'fade',
  transitionDuration: 0.6,
  texts: [],
  music: null, // { name, url, el, duration, volume, offset, mood? }
  clipVolume: 100,
  watermark: false,
}

export const clipLength = (c) => (c.kind === 'video' ? Math.max(0.1, (c.out - c.in) / c.speed) : c.dur)

// Start / end of every clip; clips overlap by the incoming transition.
export function buildTimeline(clips, project) {
  const items = []
  let end = 0
  clips.forEach((clip, i) => {
    const len = clipLength(clip)
    const type = clip.transition ?? project.transition
    let td = 0
    if (i > 0 && type !== 'none') td = Math.min(project.transitionDuration, len / 2, items[i - 1].len / 2)
    const start = Math.max(0, end - td)
    items.push({ clip, start, end: start + len, len, td, type, index: i })
    end = start + len
  })
  return { items, total: end }
}

const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2)
const easeOutBack = (p) => 1 + 2.2 * Math.pow(p - 1, 3) + 1.2 * Math.pow(p - 1, 2)

function mediaSize(el) {
  return { w: el.videoWidth || el.naturalWidth || el.width || 0, h: el.videoHeight || el.naturalHeight || el.height || 0 }
}

function drawMedia(ctx, el, W, H, fit, zoom = 1, dx = 0, dy = 0, filter = 'none') {
  const { w, h } = mediaSize(el)
  if (!w || !h) return
  if (fit === 'blur') {
    const s = Math.max(W / w, H / h) * 1.1
    ctx.save()
    ctx.filter = `blur(${Math.round(W / 30)}px) brightness(0.65) ${filter === 'none' ? '' : filter}`
    ctx.drawImage(el, (W - w * s) / 2, (H - h * s) / 2, w * s, h * s)
    ctx.restore()
  }
  const s = (fit === 'cover' ? Math.max(W / w, H / h) : Math.min(W / w, H / h)) * zoom
  ctx.filter = filter
  ctx.drawImage(el, (W - w * s) / 2 + dx, (H - h * s) / 2 + dy, w * s, h * s)
  ctx.filter = 'none'
}

function drawClip(ctx, W, H, it, local, p, look) {
  const c = it.clip
  ctx.save()
  let filter = look.filter
  if (p < 1) {
    const e = ease(p)
    switch (it.type) {
      case 'fade':
        ctx.globalAlpha = e
        break
      case 'slide':
        ctx.translate((1 - e) * W, 0)
        break
      case 'zoom':
        ctx.globalAlpha = e
        ctx.translate(W / 2, H / 2)
        ctx.scale(1.25 - 0.25 * e, 1.25 - 0.25 * e)
        ctx.translate(-W / 2, -H / 2)
        break
      case 'wipe':
        ctx.beginPath()
        ctx.rect(0, 0, W * e, H)
        ctx.clip()
        break
      case 'blur':
        ctx.globalAlpha = e
        filter = `${filter === 'none' ? '' : filter} blur(${((1 - e) * W) / 40}px)`
        break
      case 'flash':
        ctx.globalAlpha = p < 0.5 ? 0 : 1
        break
    }
  }
  // Ken Burns: slow zoom + pan on photos
  let zoom = 1, dx = 0, dy = 0
  if (c.kind === 'image' && c.kenBurns) {
    const k = Math.min(1, local / it.len)
    const dir = it.index % 2 ? -1 : 1
    zoom = dir > 0 ? 1 + 0.12 * k : 1.12 - 0.12 * k
    dx = dir * (k - 0.5) * W * 0.04
    dy = (it.index % 3 === 0 ? -1 : 1) * (k - 0.5) * H * 0.02
  }
  drawMedia(ctx, c.el, W, H, c.fit || 'cover', zoom, dx, dy, filter)
  ctx.restore()
}

// The look (filter preset) of the whole project, cached per preset/amount
const lookCache = new Map()
export function projectLook(project) {
  const key = `${project.filter}|${project.filterAmount}`
  if (!lookCache.has(key)) {
    const adj = presetAdjustments(project.filter, project.filterAmount)
    lookCache.set(key, { adj, filter: cssFilter(adj) })
  }
  return lookCache.get(key)
}

const TEXT_Y = { top: 0.14, center: 0.5, bottom: 0.84 }

export function drawFrame(ctx, W, H, timeline, project, t) {
  ctx.save()
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)
  const look = projectLook(project)
  const { items, total } = timeline
  const tt = Math.min(t, Math.max(0, total - 0.001))
  let flash = 0
  for (const it of items) {
    if (tt < it.start || tt >= it.end) continue
    const local = tt - it.start
    const p = it.td > 0 && local < it.td ? local / it.td : 1
    drawClip(ctx, W, H, it, local, p, look)
    if (it.type === 'flash' && p < 1) flash = Math.max(flash, 1 - Math.abs(2 * p - 1))
  }
  drawOverlays(ctx, look.adj, 0, 0, W, H)
  drawVignette(ctx, look.adj.vignette, 0, 0, W, H)
  if (flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${flash})`
    ctx.fillRect(0, 0, W, H)
  }

  // animated text
  for (const tx of project.texts) {
    if (t < tx.start || t >= tx.end) continue
    const inT = t - tx.start
    const outT = tx.end - t
    const fadeOut = Math.min(1, outT / 0.35)
    const opts = { alpha: Math.min(1, inT / 0.35) * fadeOut }
    if (tx.anim === 'pop') {
      opts.scale = easeOutBack(Math.min(1, inT / 0.45))
      opts.alpha = Math.min(1, inT / 0.15) * fadeOut
    } else if (tx.anim === 'slide') {
      opts.dy = (1 - ease(Math.min(1, inT / 0.6))) * H * 0.06
    } else if (tx.anim === 'typewriter') {
      opts.chars = Math.floor(inT * 16)
      opts.alpha = fadeOut
    } else if (tx.anim === 'scroll') {
      // ticker: right → left across the screen
      opts.dx = (0.5 - inT / (tx.end - tx.start)) * 2 * W
      opts.alpha = 1
    } else if (tx.anim === 'credits') {
      // film credits: bottom → top
      opts.dy = (0.5 - inT / (tx.end - tx.start)) * 2 * H - ((tx.y ?? TEXT_Y[tx.position] ?? 0.5) - 0.5) * H
      opts.alpha = 1
    }
    drawTexts(ctx, [{ ...tx, y: tx.y ?? TEXT_Y[tx.position] ?? 0.84 }], 0, 0, W, H, W, H, opts)
  }
  if (project.watermark) drawWatermark(ctx, 0, 0, W, H)
  ctx.restore()
}

// ---- audio ------------------------------------------------------------------------------
// Every video element and the song are routed through one AudioContext so the
// same mix is heard in the preview and recorded in the export.
export class Mixer {
  constructor() {
    this.ctx = new AudioContext()
    this.master = this.ctx.createGain()
    this.master.connect(this.ctx.destination)
    this.dest = this.ctx.createMediaStreamDestination()
    this.master.connect(this.dest)
    this.nodes = new Map()
  }
  gain(el, v) {
    let g = this.nodes.get(el)
    if (!g) {
      try {
        const src = this.ctx.createMediaElementSource(el)
        g = this.ctx.createGain()
        src.connect(g).connect(this.master)
      } catch {
        g = { gain: { value: 1, setTargetAtTime() {} } }
      }
      this.nodes.set(el, g)
    }
    if (g.gain.setTargetAtTime) g.gain.setTargetAtTime(Math.max(0, v), this.ctx.currentTime, 0.04)
  }
  resume() {
    return this.ctx.state === 'suspended' ? this.ctx.resume() : Promise.resolve()
  }
}

// Keep <video> / <audio> elements in step with the timeline time `t`.
export function syncMedia(timeline, project, t, playing, mixer) {
  const { items, total } = timeline
  for (const it of items) {
    const c = it.clip
    if (c.kind !== 'video') continue
    const el = c.el
    const active = t >= it.start && t < it.end
    const desired = c.in + (t - it.start) * c.speed
    if (active) {
      if (el.playbackRate !== c.speed) el.playbackRate = c.speed
      if (playing) {
        if (el.paused) {
          if (Math.abs(el.currentTime - desired) > 0.08) el.currentTime = desired
          el.play().catch(() => {})
        } else if (Math.abs(el.currentTime - desired) > 0.35) el.currentTime = desired
      } else {
        if (!el.paused) el.pause()
        if (Math.abs(el.currentTime - desired) > 0.04 && !el.seeking) el.currentTime = desired
      }
      // cross-fade the sound during transitions
      const local = t - it.start
      const fadeIn = it.td > 0 && local < it.td ? local / it.td : 1
      const next = items[it.index + 1]
      const fadeOut = next && t > next.start && next.td > 0 ? 1 - (t - next.start) / next.td : 1
      mixer?.gain(el, ((c.volume ?? 100) / 100) * (project.clipVolume / 100) * fadeIn * fadeOut)
    } else {
      if (!el.paused) el.pause()
      // pre-roll the next clip so it starts without a stall
      if (t < it.start && it.start - t < 1.5 && Math.abs(el.currentTime - c.in) > 0.05 && !el.seeking) el.currentTime = c.in
    }
  }

  const m = project.music
  if (m?.el) {
    const el = m.el
    const dur = m.duration || el.duration || 0
    if (t >= total || !dur) {
      if (!el.paused) el.pause()
    } else {
      // play only the chosen part of the song (start → end), looping it if needed
      const from = Math.min(m.offset || 0, dur - 0.5)
      const to = Math.min(dur, m.end > from ? m.end : dur)
      const desired = from + (t % Math.max(0.5, to - from))
      if (playing) {
        if (el.paused) {
          el.currentTime = desired
          el.play().catch(() => {})
        } else if (Math.abs(el.currentTime - desired) > 0.35) el.currentTime = desired
      } else if (!el.paused) el.pause()
      const fade = Math.min(1, t / 1.2, (total - t) / 2.5)
      mixer?.gain(el, ((m.volume ?? 80) / 100) * Math.max(0, fade))
    }
  }
}

export function pauseAll(clips, project) {
  for (const c of clips) if (c.kind === 'video' && !c.el.paused) c.el.pause()
  if (project.music?.el && !project.music.el.paused) project.music.el.pause()
}

// ---- export -------------------------------------------------------------------------------
export function pickMime() {
  const types = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,opus', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  return types.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || ''
}

const waitSeek = (el) =>
  new Promise((r) => {
    if (!el.seeking) return r()
    el.addEventListener('seeked', r, { once: true })
    setTimeout(r, 1500)
  })

// Records the timeline in real time (what you see + hear) to a video file.
export async function exportVideo({ clips, project, mixer, quality = 1, onProgress, signal }) {
  const timeline = buildTimeline(clips, project)
  const [bw, bh] = ASPECTS[project.aspect]
  const W = Math.round((bw * quality) / 2) * 2
  const H = Math.round((bh * quality) / 2) * 2
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  await mixer.resume()
  pauseAll(clips, project)
  for (const c of clips) if (c.kind === 'video') c.el.currentTime = c.in
  await Promise.all(clips.filter((c) => c.kind === 'video').map((c) => waitSeek(c.el)))
  drawFrame(ctx, W, H, timeline, project, 0)

  const mimeType = pickMime()
  const stream = canvas.captureStream(30)
  mixer.dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr))
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: Math.round(12e6 * quality), audioBitsPerSecond: 192000 })
  const chunks = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const done = new Promise((r) => (rec.onstop = r))
  rec.start(500)

  const t0 = performance.now()
  await new Promise((resolve) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000
      if (signal?.aborted || t >= timeline.total) return resolve()
      syncMedia(timeline, project, t, true, mixer)
      drawFrame(ctx, W, H, timeline, project, t)
      onProgress?.(t / timeline.total)
      requestAnimationFrame(tick)
    }
    tick()
  })
  drawFrame(ctx, W, H, timeline, project, timeline.total)
  rec.stop()
  await done
  pauseAll(clips, project)
  stream.getVideoTracks().forEach((tr) => tr.stop())
  if (signal?.aborted) return null
  const type = (mimeType || 'video/webm').split(';')[0]
  return { blob: new Blob(chunks, { type }), ext: type === 'video/mp4' ? 'mp4' : 'webm', width: W, height: H }
}

// ---- loading media ------------------------------------------------------------------------
export function loadVideo(file) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('video')
    el.preload = 'auto'
    el.playsInline = true
    el.src = URL.createObjectURL(file)
    el.onloadeddata = () => resolve(el)
    el.onerror = () => reject(new Error(`"${file.name}" could not be opened. Try MP4 (H.264), MOV or WEBM.`))
  })
}

export async function thumbnail(el, at) {
  const c = document.createElement('canvas')
  const { w, h } = mediaSize(el)
  const s = 160 / Math.max(w, h)
  c.width = Math.max(1, Math.round(w * s))
  c.height = Math.max(1, Math.round(h * s))
  if (el.tagName === 'VIDEO') {
    el.currentTime = at
    await new Promise((r) => {
      el.addEventListener('seeked', r, { once: true })
      setTimeout(r, 2000)
    })
  }
  c.getContext('2d').drawImage(el, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.7)
}

export function loadAudio(src) {
  return new Promise((resolve, reject) => {
    const el = new Audio()
    el.preload = 'auto'
    el.src = src
    el.onloadedmetadata = () => resolve(el)
    el.onerror = () => reject(new Error('This audio file could not be opened. Try MP3, M4A or WAV.'))
  })
}
