// Every edit in CandyClick is expressed as a set of adjustment values.
// The prompt parser changes these values; the renderer turns them into pixels.

export const DEFAULT_ADJUSTMENTS = {
  brightness: 100, // %
  contrast: 100, // %
  saturation: 100, // %
  hue: 0, // degrees
  warmth: 0, // -100 (cool) .. 100 (warm)
  sepia: 0, // %
  grayscale: 0, // %
  blur: 0, // px
  sharpen: 0, // 0..100
  vignette: 0, // 0..100
  fade: 0, // 0..100
  grain: 0, // 0..100
  rotate: 0, // 0 | 90 | 180 | 270
  flipH: false,
  flipV: false,
}

// Slider definitions used by the manual adjustment panel and for clamping.
export const SLIDERS = [
  { key: 'brightness', label: 'Brightness', min: 20, max: 200, unit: '%' },
  { key: 'contrast', label: 'Contrast', min: 20, max: 200, unit: '%' },
  { key: 'saturation', label: 'Saturation', min: 0, max: 250, unit: '%' },
  { key: 'warmth', label: 'Warmth', min: -100, max: 100, unit: '' },
  { key: 'hue', label: 'Hue', min: -180, max: 180, unit: '°' },
  { key: 'sepia', label: 'Sepia', min: 0, max: 100, unit: '%' },
  { key: 'grayscale', label: 'Black & White', min: 0, max: 100, unit: '%' },
  { key: 'fade', label: 'Fade / Matte', min: 0, max: 100, unit: '' },
  { key: 'vignette', label: 'Vignette', min: 0, max: 100, unit: '' },
  { key: 'sharpen', label: 'Sharpen', min: 0, max: 100, unit: '' },
  { key: 'blur', label: 'Blur / Soft', min: 0, max: 10, step: 0.1, unit: 'px' },
  { key: 'grain', label: 'Film Grain', min: 0, max: 100, unit: '' },
]

const LIMITS = Object.fromEntries(SLIDERS.map((s) => [s.key, [s.min, s.max]]))

export function clampAdjustments(adj) {
  const out = { ...adj }
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    out[key] = Math.min(max, Math.max(min, Math.round(out[key] * 10) / 10))
  }
  out.rotate = ((out.rotate % 360) + 360) % 360
  return out
}

export function isDefault(adj) {
  return Object.keys(DEFAULT_ADJUSTMENTS).every((k) => adj[k] === DEFAULT_ADJUSTMENTS[k])
}
