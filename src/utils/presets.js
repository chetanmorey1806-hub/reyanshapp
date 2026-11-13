import { DEFAULT_ADJUSTMENTS, TONE_KEYS, clampAdjustments } from './adjustments.js'
import { getMyPresets } from './brand.js'

// One-tap looks for photos and videos. Values are the full "look" (missing keys = neutral).
export const PRESETS = [
  { name: 'Original', adj: {} },
  { name: 'Auto Pro', adj: { exposure: 6, contrast: 108, shadows: 18, highlights: -14, vibrance: 22, clarity: 14, sharpen: 15 } },
  { name: 'Vivid', adj: { contrast: 114, vibrance: 40, saturation: 112, clarity: 18, sharpen: 15 } },
  { name: 'Warm Glow', adj: { warmth: 32, exposure: 5, vibrance: 15, highlights: -10, fade: 8 } },
  { name: 'Cool Crisp', adj: { warmth: -26, tint: -4, contrast: 110, clarity: 20, sharpen: 20 } },
  { name: 'Cinematic', adj: { contrast: 118, saturation: 88, warmth: 10, tint: -8, shadows: -10, highlights: -18, vignette: 35, fade: 10 } },
  { name: 'Teal & Orange', adj: { warmth: 18, tint: -14, hue: -6, contrast: 115, vibrance: 25, highlights: -12, vignette: 20 } },
  { name: 'Wedding', adj: { exposure: 10, warmth: 16, contrast: 94, highlights: -20, shadows: 16, fade: 14, vibrance: 8, blur: 0.2, vignette: 15 } },
  { name: 'Pastel', adj: { exposure: 10, contrast: 88, fade: 26, saturation: 104, hue: -6, highlights: -10 } },
  { name: 'Matte Film', adj: { contrast: 92, fade: 30, saturation: 90, warmth: 8, grain: 18, blacks: 20 } },
  { name: 'Vintage', adj: { sepia: 40, fade: 24, contrast: 92, saturation: 82, vignette: 30, grain: 22, warmth: 12 } },
  { name: 'Golden Hour', adj: { warmth: 45, tint: 6, vibrance: 22, contrast: 108, highlights: -12, vignette: 22 } },
  { name: 'Moody', adj: { exposure: -12, saturation: 74, contrast: 112, warmth: -12, shadows: -8, vignette: 40, fade: 10 } },
  { name: 'Portrait', adj: { exposure: 6, warmth: 12, clarity: -18, highlights: -10, shadows: 10, vignette: 18 } },
  { name: 'Food', adj: { vibrance: 30, warmth: 14, clarity: 20, sharpen: 25, contrast: 108, exposure: 5 } },
  { name: 'Landscape', adj: { vibrance: 35, clarity: 30, contrast: 110, highlights: -24, shadows: 18, sharpen: 25 } },
  { name: 'Night', adj: { exposure: -16, warmth: -30, contrast: 112, vignette: 32, tint: 6 } },
  { name: 'B&W Classic', adj: { grayscale: 100, contrast: 120, clarity: 15 } },
  { name: 'Noir', adj: { grayscale: 100, contrast: 145, blacks: -20, vignette: 50, grain: 15 } },
  { name: 'Sepia', adj: { sepia: 70, contrast: 105, vignette: 20 } },
]

export const PRESET_NAMES = PRESETS.map((p) => p.name)

// built-in looks + the photographer's own saved presets
export const allPresets = () => [...PRESETS, ...getMyPresets()]

// the "look" part of an adjustment set (what a preset saves)
export function lookOf(adj) {
  const out = {}
  for (const k of TONE_KEYS) if (adj[k] !== DEFAULT_ADJUSTMENTS[k]) out[k] = adj[k]
  if (adj.hsl && Object.keys(adj.hsl).length) out.hsl = adj.hsl
  if (adj.curve) out.curve = adj.curve
  return out
}

// Apply a preset on top of `adj` (keeps geometry, crop, frame and text). amount 0..100
export function applyPreset(adj, preset, amount = 100) {
  const p = typeof preset === 'string' ? allPresets().find((x) => x.name === preset) : preset
  if (!p) return adj
  const out = { ...adj }
  const f = amount / 100
  for (const k of TONE_KEYS) {
    const target = p.adj[k] ?? DEFAULT_ADJUSTMENTS[k]
    out[k] = DEFAULT_ADJUSTMENTS[k] + (target - DEFAULT_ADJUSTMENTS[k]) * f
  }
  // saved presets may carry a colour mix and tone curve (applied as saved)
  if (p.mine) {
    out.hsl = p.adj.hsl ?? {}
    out.curve = p.adj.curve ?? null
  }
  return clampAdjustments(out)
}

// Full adjustment object for a preset (used by the video engine)
export function presetAdjustments(name, amount = 100) {
  return applyPreset(DEFAULT_ADJUSTMENTS, name, amount)
}
