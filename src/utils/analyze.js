import { renderToCanvas } from './renderer.js'
import { clampAdjustments } from './adjustments.js'

// Renders the photo (with current edits) small, for analysis and for sending to the AI.
export function snapshot(img, adj, size = 768) {
  const canvas = document.createElement('canvas')
  renderToCanvas(canvas, img, adj, size)
  return canvas
}

export function toDataUrl(canvas) {
  return canvas.toDataURL('image/jpeg', 0.85)
}

// Basic exposure / contrast / colour statistics of a canvas.
export function imageStats(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let lum = 0, lum2 = 0, sat = 0, r = 0, b = 0, n = 0
  for (let i = 0; i < data.length; i += 16) {
    const R = data[i] / 255, G = data[i + 1] / 255, B = data[i + 2] / 255
    const L = 0.2126 * R + 0.7152 * G + 0.0722 * B
    const max = Math.max(R, G, B), min = Math.min(R, G, B)
    lum += L; lum2 += L * L; sat += max === 0 ? 0 : (max - min) / max
    r += R; b += B; n++
  }
  const mean = lum / n
  return {
    brightness: mean,
    contrast: Math.sqrt(Math.max(0, lum2 / n - mean * mean)),
    saturation: sat / n,
    colourCast: (r - b) / n, // >0 warm, <0 cool
  }
}

// Photo-aware enhancement used when the prompt isn't understood offline.
// Moves the photo towards a well-exposed, punchy, neutral result and
// leans in the direction of any mood words found in the prompt.
export function autoEnhance(adj, stats, prompt = '') {
  const next = { ...adj }
  const notes = []

  const exposureFix = (0.5 - stats.brightness) * 70
  if (Math.abs(exposureFix) > 3) {
    next.brightness += Math.max(-20, Math.min(25, exposureFix))
    notes.push(exposureFix > 0 ? 'lifted exposure' : 'reduced exposure')
  }
  if (stats.contrast < 0.22) {
    next.contrast += 12
    notes.push('added contrast')
  } else {
    next.contrast += 4
  }
  if (stats.saturation < 0.3) {
    next.saturation += 18
    notes.push('boosted colours')
  } else {
    next.saturation += 6
  }
  if (stats.colourCast < -0.04) {
    next.warmth += 12
    notes.push('removed blue cast')
  } else if (stats.colourCast > 0.12) {
    next.warmth -= 10
    notes.push('removed orange cast')
  }
  next.sharpen += 15
  notes.push('sharpened details')

  // mood hints – any language
  const p = prompt.toLowerCase()
  if (/love|romantic|prem|प्रेम|pyaar|प्यार|soft|cute|gentle/.test(p)) {
    next.warmth += 15; next.fade += 12; next.blur += 0.3; notes.push('romantic warmth')
  }
  if (/sad|horror|scary|bhiti|भीती|dar|डर|mystery|dark/.test(p)) {
    next.brightness -= 12; next.saturation -= 25; next.vignette += 40; next.warmth -= 15; notes.push('darker mood')
  }
  if (/happy|khush|खुश|आनंद|anand|fun|party|festival|sann|सण|diwali|दिवाळी|holi/.test(p)) {
    next.brightness += 6; next.saturation += 18; next.warmth += 10; notes.push('happy, vibrant colours')
  }
  if (/professional|pro|studio|clean|natural/.test(p)) {
    next.saturation -= 4; next.vignette += 10
  }

  return { adjustments: clampAdjustments(next), notes }
}
