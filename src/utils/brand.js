// Photographer's brand kit: watermark text and/or logo, saved on this device
// and used on photos and videos. Also stores the photographer's own presets.

const KEY = 'brandKit'
const PRESET_KEY = 'myPresets'

const DEFAULT_BRAND = { text: 'Stories by Reyansh', logo: '', position: 'br', opacity: 80, size: 4, color: '#ffffff' }

const read = (k, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? fallback
  } catch {
    return fallback
  }
}
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* storage full or blocked: keep it for this session only */
  }
}

let brand = { ...DEFAULT_BRAND, ...read(KEY, {}) }
let logoImg = null

function loadLogo() {
  logoImg = null
  if (!brand.logo) return
  const img = new Image()
  img.onload = () => {
    logoImg = img
    window.dispatchEvent(new Event('brandchange'))
  }
  img.src = brand.logo
}
if (typeof window !== 'undefined') loadLogo()

export const getBrand = () => brand

export function setBrand(patch) {
  const logoChanged = patch.logo !== undefined && patch.logo !== brand.logo
  brand = { ...brand, ...patch }
  write(KEY, brand)
  if (logoChanged) loadLogo()
  window.dispatchEvent(new Event('brandchange'))
}

// Draws the watermark in a corner of the region (x, y, w, h)
export function drawWatermark(ctx, x, y, w, h) {
  const b = brand
  if (!b.text && !logoImg) return
  const unit = Math.min(w, h)
  const pad = unit * 0.035
  const size = (unit * b.size) / 100
  ctx.save()
  ctx.globalAlpha = b.opacity / 100
  ctx.font = `600 ${size}px "Montserrat", "Noto Sans Devanagari", sans-serif`
  ctx.textBaseline = 'middle'
  const tw = b.text ? ctx.measureText(b.text).width : 0
  const lh = logoImg ? size * 2.2 : 0
  const lw = logoImg ? (logoImg.naturalWidth / logoImg.naturalHeight) * lh : 0
  const gap = logoImg && b.text ? size * 0.6 : 0
  const total = lw + gap + tw
  const height = Math.max(lh, size)
  const left = b.position.includes('l') ? x + pad : b.position.includes('c') ? x + (w - total) / 2 : x + w - pad - total
  const top = b.position.includes('t') ? y + pad : y + h - pad - height
  if (logoImg) ctx.drawImage(logoImg, left, top + (height - lh) / 2, lw, lh)
  if (b.text) {
    ctx.shadowColor = 'rgba(0,0,0,0.45)'
    ctx.shadowBlur = size * 0.4
    ctx.fillStyle = b.color
    ctx.fillText(b.text, left + lw + gap, top + height / 2)
  }
  ctx.restore()
}

// ---- my presets ----------------------------------------------------------------
export const getMyPresets = () => read(PRESET_KEY, [])
export function saveMyPreset(name, adj) {
  const list = getMyPresets().filter((p) => p.name !== name)
  list.push({ name, adj, mine: true })
  write(PRESET_KEY, list)
  window.dispatchEvent(new Event('presetschange'))
  return list
}
export function deleteMyPreset(name) {
  const list = getMyPresets().filter((p) => p.name !== name)
  write(PRESET_KEY, list)
  window.dispatchEvent(new Event('presetschange'))
  return list
}
