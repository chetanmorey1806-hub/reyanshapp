// Draws a photo with a set of adjustments onto a canvas.
// Used for the live preview (downscaled), thumbnails, AI snapshots and the
// full-resolution export, so what you see is exactly what you download.
//
// Pipeline: frame border → geometry (rotate / straighten / flip / crop) with
// CSS-style filters → colour overlays (temperature, tint, fade) → pixel pass
// (exposure & tone curve, vibrance, clarity, sharpen, grain) → vignette → text.

import { drawWatermark } from './brand.js'

// Browsers can't create canvases above ~16k px per side / ~120 MP.
const MAX_SIDE = 16000
const MAX_AREA = 120e6
const FULL = { x: 0, y: 0, w: 1, h: 1 }

const srcSize = (img) => ({ sw: img.naturalWidth || img.videoWidth || img.width, sh: img.naturalHeight || img.videoHeight || img.height })

// All sizes for a given render. `maxSize` limits the longest side of the output.
export function computeLayout(img, adj, maxSize = Infinity) {
  const { sw, sh } = srcSize(img)
  const quarter = adj.rotate === 90 || adj.rotate === 270
  const fw = quarter ? sh : sw
  const fh = quarter ? sw : sh
  const crop = adj.crop ?? FULL
  const cw0 = fw * crop.w
  const ch0 = fh * crop.h
  const b0 = ((adj.frame || 0) / 100) * Math.min(cw0, ch0)
  const ow = cw0 + 2 * b0
  const oh = ch0 + 2 * b0
  const scale = Math.min(1, maxSize / Math.max(ow, oh), MAX_SIDE / Math.max(ow, oh), Math.sqrt(MAX_AREA / (ow * oh)))
  return {
    sw, sh, fw, fh, crop, scale,
    W: Math.max(1, Math.round(ow * scale)),
    H: Math.max(1, Math.round(oh * scale)),
    b: b0 * scale,
    cw: cw0 * scale,
    ch: ch0 * scale,
  }
}

export function outputSize(img, adj, maxSize = Infinity) {
  const { W, H } = computeLayout(img, adj, maxSize)
  return { width: W, height: H }
}

// Scale needed so a rotated frame still covers the whole frame (no empty corners)
function coverScale(deg, w, h) {
  const t = Math.abs((deg * Math.PI) / 180)
  return Math.cos(t) + Math.max(w / h, h / w) * Math.sin(t)
}

export function cssFilter(adj, blurPx = 0) {
  return [
    adj.brightness !== 100 && `brightness(${adj.brightness}%)`,
    adj.contrast !== 100 && `contrast(${adj.contrast}%)`,
    adj.saturation !== 100 && `saturate(${adj.saturation}%)`,
    adj.hue && `hue-rotate(${adj.hue}deg)`,
    adj.sepia && `sepia(${adj.sepia}%)`,
    adj.grayscale && `grayscale(${adj.grayscale}%)`,
    blurPx > 0.05 && `blur(${blurPx.toFixed(2)}px)`,
  ]
    .filter(Boolean)
    .join(' ') || 'none'
}

// Colour overlays that work on any canvas region (also used by the video engine)
export function drawOverlays(ctx, adj, x, y, w, h) {
  const fill = (op, alpha, color) => {
    ctx.save()
    ctx.globalCompositeOperation = op
    ctx.globalAlpha = alpha
    ctx.fillStyle = color
    ctx.fillRect(x, y, w, h)
    ctx.restore()
  }
  if (adj.warmth) fill('soft-light', Math.min(1, Math.abs(adj.warmth) / 100) * 0.6, adj.warmth > 0 ? '#ff9a2e' : '#2e7dff')
  if (adj.tint) fill('soft-light', Math.min(1, Math.abs(adj.tint) / 100) * 0.45, adj.tint > 0 ? '#ff3dc8' : '#2dff6a')
  if (adj.fade > 0) fill('screen', (adj.fade / 100) * 0.45, '#5a5a5a')
}

export function drawVignette(ctx, amount, x, y, w, h) {
  if (!(amount > 0)) return
  ctx.save()
  const r = Math.sqrt(w * w + h * h) / 2
  const g = ctx.createRadialGradient(x + w / 2, y + h / 2, r * 0.35, x + w / 2, y + h / 2, r)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, `rgba(0,0,0,${(amount / 100) * 0.85})`)
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)
  ctx.restore()
}

export function renderToCanvas(canvas, img, adj, maxSize = Infinity) {
  const L = computeLayout(img, adj, maxSize)
  const { W, H, b, cw, ch, fw, fh, sw, sh, crop, scale } = L
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.clearRect(0, 0, W, H)

  // 1. Frame / border
  if (b > 0) {
    ctx.fillStyle = adj.frameColor || '#ffffff'
    ctx.fillRect(0, 0, W, H)
  }

  // 2. Geometry + built-in filters (GPU accelerated)
  ctx.save()
  ctx.beginPath()
  ctx.rect(b, b, cw, ch)
  ctx.clip()
  ctx.filter = cssFilter(adj, (adj.blur * Math.max(cw, ch)) / 1200)
  ctx.translate(b - crop.x * fw * scale, b - crop.y * fh * scale)
  ctx.translate((fw * scale) / 2, (fh * scale) / 2)
  ctx.rotate((((adj.rotate || 0) + (adj.straighten || 0)) * Math.PI) / 180)
  const s = adj.straighten ? coverScale(adj.straighten, fw, fh) : 1
  ctx.scale((adj.flipH ? -1 : 1) * s, (adj.flipV ? -1 : 1) * s)
  ctx.drawImage(img, (-sw * scale) / 2, (-sh * scale) / 2, sw * scale, sh * scale)
  ctx.restore()

  // 3. Temperature, tint, fade
  drawOverlays(ctx, adj, b, b, cw, ch)

  // 4. Pixel-level effects
  pixelPass(ctx, adj, Math.round(b), Math.round(b), Math.round(cw), Math.round(ch))

  // 5. Vignette
  drawVignette(ctx, adj.vignette, b, b, cw, ch)

  // 6. Text & stickers, watermark
  const textBoxes = drawTexts(ctx, adj.texts, b, b, cw, ch, W, H)
  if (adj.watermark) drawWatermark(ctx, b, b, cw, ch)
  return { textBoxes, layout: L }
}

// ---- pixel pass -------------------------------------------------------------
const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

function buildLut(a) {
  if (!a.exposure && !a.highlights && !a.shadows && !a.whites && !a.blacks) return null
  const gain = Math.pow(2, (a.exposure || 0) / 50) // ±2 stops
  const lut = new Uint8ClampedArray(256)
  for (let v = 0; v < 256; v++) {
    let x = (v / 255) * gain
    if (gain > 1) x = x > 0.8 ? 0.8 + (1 - Math.exp(-(x - 0.8) * 4)) * 0.2 : x // soft roll-off, no harsh clipping
    x += (a.shadows / 100) * 0.28 * (1 - smooth(0, 0.6, x))
    x += (a.highlights / 100) * 0.25 * smooth(0.4, 1, x)
    x += (a.whites / 100) * 0.18 * smooth(0.65, 1, x)
    x += (a.blacks / 100) * 0.18 * (1 - smooth(0, 0.35, x))
    lut[v] = x * 255
  }
  return lut
}

// ---- tone curve (monotone cubic through the points, 0..255) -------------------------
const LINEAR = [[0, 0], [255, 255]]
export const isLinearCurve = (pts) => !pts || (pts.length === 2 && pts[0][0] === 0 && pts[0][1] === 0 && pts[1][0] === 255 && pts[1][1] === 255)

export function curveLut(points = LINEAR) {
  const p = [...points].sort((a, b) => a[0] - b[0])
  const n = p.length
  const lut = new Uint8ClampedArray(256)
  const d = [], m = []
  for (let i = 0; i < n - 1; i++) d.push((p[i + 1][1] - p[i][1]) / Math.max(1, p[i + 1][0] - p[i][0]))
  m.push(d[0])
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2)
  m.push(d[n - 2])
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i] }
  }
  let seg = 0
  for (let x = 0; x < 256; x++) {
    if (x <= p[0][0]) { lut[x] = p[0][1]; continue }
    if (x >= p[n - 1][0]) { lut[x] = p[n - 1][1]; continue }
    while (seg < n - 2 && x > p[seg + 1][0]) seg++
    const [x0, y0] = p[seg], [x1, y1] = p[seg + 1]
    const hh = x1 - x0, t = (x - x0) / hh, t2 = t * t, t3 = t2 * t
    lut[x] = (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * hh * m[seg] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * hh * m[seg + 1]
  }
  return lut
}

// Per-channel lookup tables: tone (exposure…) → master curve → channel curve
function buildChannelLuts(a) {
  const tone = buildLut(a)
  const c = a.curve
  const hasCurve = c && (!isLinearCurve(c.rgb) || !isLinearCurve(c.r) || !isLinearCurve(c.g) || !isLinearCurve(c.b))
  if (!tone && !hasCurve) return null
  const master = hasCurve && !isLinearCurve(c.rgb) ? curveLut(c.rgb) : null
  return ['r', 'g', 'b'].map((ch) => {
    const own = hasCurve && !isLinearCurve(c[ch]) ? curveLut(c[ch]) : null
    const out = new Uint8ClampedArray(256)
    for (let v = 0; v < 256; v++) {
      let x = tone ? tone[v] : v
      if (master) x = master[x]
      if (own) x = own[x]
      out[v] = x
    }
    return out
  })
}

// ---- HSL colour mixer ------------------------------------------------------------------
export const HSL_BANDS = [
  { key: 'red', label: 'Red', hue: 0, color: '#ff4d4d' },
  { key: 'orange', label: 'Orange', hue: 30, color: '#ff9a3d' },
  { key: 'yellow', label: 'Yellow', hue: 58, color: '#ffd93d' },
  { key: 'green', label: 'Green', hue: 120, color: '#4ccd6a' },
  { key: 'aqua', label: 'Aqua', hue: 180, color: '#3dd6d0' },
  { key: 'blue', label: 'Blue', hue: 225, color: '#4d7dff' },
  { key: 'purple', label: 'Purple', hue: 275, color: '#9b5dff' },
  { key: 'magenta', label: 'Magenta', hue: 320, color: '#ff4dc4' },
]

function hslActive(hsl) {
  if (!hsl) return null
  const bands = HSL_BANDS.map((b) => ({ c: b.hue, ...(hsl[b.key] || {}) })).filter((b) => b.h || b.s || b.l)
  return bands.length ? bands : null
}

function applyHsl(r, g, b, bands) {
  r /= 255; g /= 255; b /= 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (mx + mn) / 2
  const dd = mx - mn
  if (dd > 0.0001) {
    s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn)
    h = mx === r ? ((g - b) / dd + (g < b ? 6 : 0)) * 60 : mx === g ? ((b - r) / dd + 2) * 60 : ((r - g) / dd + 4) * 60
  } else return null
  let dh = 0, ds = 0, dl = 0
  for (const band of bands) {
    let dist = Math.abs(h - band.c)
    if (dist > 180) dist = 360 - dist
    const w = Math.max(0, 1 - dist / 40)
    if (!w) continue
    dh += w * (band.h || 0)
    ds += w * (band.s || 0)
    dl += w * (band.l || 0)
  }
  if (!dh && !ds && !dl) return null
  const sw = Math.min(1, s * 2.5) // greys are not affected
  h = (h + dh * sw + 360) % 360
  let s2 = Math.min(1, Math.max(0, s * (1 + ds / 100)))
  let l2 = Math.min(1, Math.max(0, l + (dl / 100) * 0.35 * sw))
  if (s2 === 0) return [l2 * 255, l2 * 255, l2 * 255]
  const q = l2 < 0.5 ? l2 * (1 + s2) : l2 + s2 - l2 * s2
  const p = 2 * l2 - q
  const hk = h / 360
  const conv = (t) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [conv(hk + 1 / 3) * 255, conv(hk) * 255, conv(hk - 1 / 3) * 255]
}

function pixelPass(ctx, adj, x, y, w, h) {
  const luts = buildChannelLuts(adj)
  const bands = hslActive(adj.hsl)
  const vib = (adj.vibrance || 0) / 100
  const clar = (adj.clarity || 0) / 100
  const sharp = (adj.sharpen || 0) / 100
  const grain = (adj.grain || 0) / 100
  if (!luts && !bands && !vib && !clar && !sharp && !grain) return
  if (w < 3 || h < 3) return

  // blurred copy for clarity (local contrast)
  let blurred = null
  if (clar) {
    const t = document.createElement('canvas')
    t.width = w
    t.height = h
    const tc = t.getContext('2d', { willReadFrequently: true })
    tc.filter = `blur(${Math.max(2, Math.max(w, h) / 70).toFixed(1)}px)`
    tc.drawImage(ctx.canvas, x, y, w, h, 0, 0, w, h)
    blurred = tc.getImageData(0, 0, w, h).data
  }

  const img = ctx.getImageData(x, y, w, h)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2]
    if (blurred) {
      const l = (0.3 * r + 0.59 * g + 0.11 * b) / 255
      const k = clar * 1.3 * (1 - Math.abs(l * 2 - 1))
      r += (r - blurred[i]) * k
      g += (g - blurred[i + 1]) * k
      b += (b - blurred[i + 2]) * k
    }
    if (luts) {
      r = luts[0][r < 0 ? 0 : r > 255 ? 255 : r | 0]
      g = luts[1][g < 0 ? 0 : g > 255 ? 255 : g | 0]
      b = luts[2][b < 0 ? 0 : b > 255 ? 255 : b | 0]
    }
    if (bands) {
      const o = applyHsl(r, g, b, bands)
      if (o) [r, g, b] = o
    }
    if (vib) {
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
      const sat = mx > 0 ? (mx - mn) / mx : 0
      const amt = vib > 0 ? vib * (1 - sat) * 0.9 : vib * 0.9
      const avg = (r + g + b) / 3
      r += (r - avg) * amt
      g += (g - avg) * amt
      b += (b - avg) * amt
    }
    d[i] = r
    d[i + 1] = g
    d[i + 2] = b
  }
  if (sharp) sharpen(img, sharp)
  if (grain) addGrain(img, grain)
  ctx.putImageData(img, x, y)
}

// Unsharp-style 3x3 convolution, blended by `amount` (0..1)
function sharpen(imageData, amount) {
  const { data, width, height } = imageData
  const src = new Uint8ClampedArray(data)
  const k = amount * 1.2
  const row = width * 4
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * row + x * 4
      for (let c = 0; c < 3; c++) {
        const p = i + c
        data[p] = src[p] + k * (4 * src[p] - src[p - 4] - src[p + 4] - src[p - row] - src[p + row])
      }
    }
  }
}

function addGrain(imageData, amount) {
  const { data } = imageData
  const strength = amount * 50
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * strength
    data[i] += n
    data[i + 1] += n
    data[i + 2] += n
  }
}

// ---- text & stickers -----------------------------------------------------------
export const FONTS = ['Inter', 'Montserrat', 'Playfair Display', 'Instrument Serif', 'Bebas Neue', 'Dancing Script', 'Great Vibes', 'Noto Sans Devanagari']

function fontString(t, px) {
  return `${t.italic ? 'italic ' : ''}${t.weight || 700} ${px}px "${t.font || 'Inter'}", "Noto Sans Devanagari", sans-serif`
}

// Draws text layers inside the photo region; returns their boxes normalised to the canvas.
export function drawTexts(ctx, texts, rx, ry, rw, rh, W, H, opts = {}) {
  const boxes = []
  for (const t of texts || []) {
    if (!t.text) continue
    const px = Math.max(4, (t.size || 0.08) * rw)
    const lines = String(t.text).split('\n')
    const lineH = px * 1.18
    ctx.save()
    ctx.font = fontString(t, px)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (t.spacing) ctx.letterSpacing = `${(t.spacing * px) / 100}px`
    const tw = Math.max(...lines.map((l) => ctx.measureText(l).width))
    const th = lines.length * lineH
    const cx = rx + (t.x ?? 0.5) * rw + (opts.dx || 0)
    const cy = ry + (t.y ?? 0.5) * rh + (opts.dy || 0)
    const pad = px * 0.35
    ctx.globalAlpha = (t.opacity ?? 100) / 100 * (opts.alpha ?? 1)
    if (opts.scale && opts.scale !== 1) {
      ctx.translate(cx, cy)
      ctx.scale(opts.scale, opts.scale)
      ctx.translate(-cx, -cy)
    }
    if (t.bg) {
      ctx.fillStyle = t.bg
      ctx.beginPath()
      ctx.roundRect(cx - tw / 2 - pad, cy - th / 2 - pad * 0.6, tw + pad * 2, th + pad * 1.2, pad * 0.6)
      ctx.fill()
    }
    if (t.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.55)'
      ctx.shadowBlur = px * 0.25
      ctx.shadowOffsetY = px * 0.05
    }
    lines.forEach((line, i) => {
      const ly = cy + (i - (lines.length - 1) / 2) * lineH
      const shown = opts.chars != null ? line.slice(0, Math.max(0, opts.chars - lines.slice(0, i).join('').length)) : line
      if (t.stroke) {
        ctx.lineWidth = px * 0.09
        ctx.strokeStyle = t.strokeColor || '#000000'
        ctx.lineJoin = 'round'
        ctx.strokeText(shown, cx, ly)
      }
      ctx.fillStyle = t.color || '#ffffff'
      ctx.fillText(shown, cx, ly)
    })
    ctx.restore()
    boxes.push({ id: t.id, x: (cx - tw / 2 - pad) / W, y: (cy - th / 2 - pad * 0.6) / H, w: (tw + pad * 2) / W, h: (th + pad * 1.2) / H })
  }
  return boxes
}

export function exportImage(img, adj, type = 'image/jpeg', quality = 0.95, maxSize = Infinity) {
  const canvas = document.createElement('canvas')
  renderToCanvas(canvas, img, adj, maxSize)
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}
