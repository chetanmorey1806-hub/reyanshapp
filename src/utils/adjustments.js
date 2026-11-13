// Every photo edit is expressed as a set of adjustment values.
// The prompt parser / AI / manual tools change these values; the renderer turns them into pixels.

export const DEFAULT_ADJUSTMENTS = {
  // light
  exposure: 0, // -100..100 (stops * 50)
  brightness: 100, // %
  contrast: 100, // %
  highlights: 0, // -100..100
  shadows: 0, // -100..100
  whites: 0, // -100..100
  blacks: 0, // -100..100
  // colour
  warmth: 0, // -100 (cool) .. 100 (warm)
  tint: 0, // -100 (green) .. 100 (magenta)
  vibrance: 0, // -100..100
  saturation: 100, // %
  hue: 0, // degrees
  // effects
  clarity: 0, // -100..100
  sharpen: 0, // 0..100
  blur: 0, // px
  vignette: 0, // 0..100
  fade: 0, // 0..100
  grain: 0, // 0..100
  sepia: 0, // %
  grayscale: 0, // %
  hsl: {}, // per-colour { red: { h, s, l }, … }
  curve: null, // { rgb, r, g, b } tone-curve points
  // geometry
  rotate: 0, // 0 | 90 | 180 | 270
  straighten: 0, // -45..45 degrees
  flipH: false,
  flipV: false,
  crop: null, // { x, y, w, h } normalised to the rotated + straightened frame
  // decoration
  frame: 0, // border size, % of the shorter side
  frameColor: '#ffffff',
  texts: [], // text & sticker layers, see TextPanel
  watermark: false, // brand watermark (see utils/brand.js)
}

// Slider definitions used by the manual panels and for clamping.
export const SLIDERS = [
  { key: 'exposure', label: 'Exposure', min: -100, max: 100, group: 'Light' },
  { key: 'brightness', label: 'Brightness', min: 20, max: 200, unit: '%', group: 'Light' },
  { key: 'contrast', label: 'Contrast', min: 20, max: 200, unit: '%', group: 'Light' },
  { key: 'highlights', label: 'Highlights', min: -100, max: 100, group: 'Light' },
  { key: 'shadows', label: 'Shadows', min: -100, max: 100, group: 'Light' },
  { key: 'whites', label: 'Whites', min: -100, max: 100, group: 'Light' },
  { key: 'blacks', label: 'Blacks', min: -100, max: 100, group: 'Light' },
  { key: 'warmth', label: 'Temperature', min: -100, max: 100, group: 'Colour' },
  { key: 'tint', label: 'Tint', min: -100, max: 100, group: 'Colour' },
  { key: 'vibrance', label: 'Vibrance', min: -100, max: 100, group: 'Colour' },
  { key: 'saturation', label: 'Saturation', min: 0, max: 250, unit: '%', group: 'Colour' },
  { key: 'hue', label: 'Hue', min: -180, max: 180, unit: '°', group: 'Colour' },
  { key: 'clarity', label: 'Clarity', min: -100, max: 100, group: 'Effects' },
  { key: 'sharpen', label: 'Sharpen', min: 0, max: 100, group: 'Effects' },
  { key: 'blur', label: 'Blur / Soft', min: 0, max: 10, step: 0.1, unit: 'px', group: 'Effects' },
  { key: 'vignette', label: 'Vignette', min: 0, max: 100, group: 'Effects' },
  { key: 'fade', label: 'Fade / Matte', min: 0, max: 100, group: 'Effects' },
  { key: 'grain', label: 'Film Grain', min: 0, max: 100, group: 'Effects' },
  { key: 'sepia', label: 'Sepia', min: 0, max: 100, unit: '%', group: 'Effects' },
  { key: 'grayscale', label: 'Black & White', min: 0, max: 100, unit: '%', group: 'Effects' },
  { key: 'straighten', label: 'Straighten', min: -45, max: 45, step: 0.5, unit: '°', group: 'Geometry' },
  { key: 'frame', label: 'Border size', min: 0, max: 20, step: 0.5, unit: '%', group: 'Frame' },
]

// keys that describe the "look" (used by presets and auto-enhance)
export const TONE_KEYS = SLIDERS.filter((s) => ['Light', 'Colour', 'Effects'].includes(s.group)).map((s) => s.key)

const LIMITS = Object.fromEntries(SLIDERS.map((s) => [s.key, [s.min, s.max]]))

export function clampAdjustments(adj) {
  const out = { ...DEFAULT_ADJUSTMENTS, ...adj }
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    const v = Number(out[key])
    out[key] = Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v * 10) / 10)) : DEFAULT_ADJUSTMENTS[key]
  }
  out.rotate = ((Math.round((Number(out.rotate) || 0) / 90) * 90) % 360 + 360) % 360
  if (!Array.isArray(out.texts)) out.texts = []
  if (!out.hsl || typeof out.hsl !== 'object') out.hsl = {}
  return out
}

export function isDefault(adj) {
  return JSON.stringify(clampAdjustments(adj)) === JSON.stringify(DEFAULT_ADJUSTMENTS)
}

// Keep geometry, crop, frame and text; reset only the look.
export function resetTone(adj) {
  const out = { ...adj }
  for (const k of TONE_KEYS) out[k] = DEFAULT_ADJUSTMENTS[k]
  out.hsl = {}
  out.curve = null
  return out
}

// Centre crop with a given aspect ratio ("4:5", "1:1"…) for a frame of size W×H.
export function centerCrop(aspect, W, H) {
  if (!aspect || aspect === 'free' || aspect === 'none') return null
  const [a, b] = String(aspect).split(':').map(Number)
  if (!a || !b) return null
  const target = a / b
  const frame = W / H
  if (Math.abs(target - frame) < 0.005) return null
  if (target < frame) {
    const w = target / frame
    return { x: (1 - w) / 2, y: 0, w, h: 1 }
  }
  const h = frame / target
  return { x: 0, y: (1 - h) / 2, w: 1, h }
}
