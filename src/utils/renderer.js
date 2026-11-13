// Draws an image with a set of adjustments onto a canvas.
// Used for the live preview (downscaled) and for the full-resolution export.

// Browsers can't create canvases above ~16k px per side / ~120 MP, so very
// large photos are scaled down to the biggest size the browser can handle.
const MAX_SIDE = 16000
const MAX_AREA = 120e6

function scaledSize(img, maxSize) {
  const srcW = img.naturalWidth || img.width
  const srcH = img.naturalHeight || img.height
  const scale = Math.min(1, maxSize / Math.max(srcW, srcH), MAX_SIDE / Math.max(srcW, srcH), Math.sqrt(MAX_AREA / (srcW * srcH)))
  return { w: Math.round(srcW * scale), h: Math.round(srcH * scale) }
}

// Final export dimensions (after rotation)
export function outputSize(img, adj) {
  const { w, h } = scaledSize(img, Infinity)
  const quarter = adj.rotate === 90 || adj.rotate === 270
  return { width: quarter ? h : w, height: quarter ? w : h }
}

export function renderToCanvas(canvas, img, adj, maxSize = Infinity) {
  const { w, h } = scaledSize(img, maxSize)

  const quarterTurn = adj.rotate === 90 || adj.rotate === 270
  canvas.width = quarterTurn ? h : w
  canvas.height = quarterTurn ? w : h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.save()
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // 1. Built-in canvas filters (GPU accelerated in most browsers)
  // blur is relative to preview size, so scale it to keep export consistent
  const blurPx = adj.blur * Math.max(w, h) / 1200
  ctx.filter = [
    `brightness(${adj.brightness}%)`,
    `contrast(${adj.contrast}%)`,
    `saturate(${adj.saturation}%)`,
    `hue-rotate(${adj.hue}deg)`,
    `sepia(${adj.sepia}%)`,
    `grayscale(${adj.grayscale}%)`,
    blurPx > 0 ? `blur(${blurPx.toFixed(2)}px)` : '',
  ].join(' ')

  // 2. Geometry: rotate + flip around the centre
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((adj.rotate * Math.PI) / 180)
  ctx.scale(adj.flipH ? -1 : 1, adj.flipV ? -1 : 1)
  ctx.drawImage(img, -w / 2, -h / 2, w, h)
  ctx.restore()

  const W = canvas.width
  const H = canvas.height

  // 3. Warmth – colour overlay with soft-light blending
  if (adj.warmth !== 0) {
    ctx.save()
    ctx.globalCompositeOperation = 'soft-light'
    ctx.globalAlpha = Math.min(1, Math.abs(adj.warmth) / 100) * 0.6
    ctx.fillStyle = adj.warmth > 0 ? '#ff9a2e' : '#2e7dff'
    ctx.fillRect(0, 0, W, H)
    ctx.restore()
  }

  // 4. Fade / matte – lift the shadows
  if (adj.fade > 0) {
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    ctx.globalAlpha = (adj.fade / 100) * 0.45
    ctx.fillStyle = '#5a5a5a'
    ctx.fillRect(0, 0, W, H)
    ctx.restore()
  }

  // 5. Pixel-level effects: sharpen + grain
  if (adj.sharpen > 0 || adj.grain > 0) {
    const data = ctx.getImageData(0, 0, W, H)
    if (adj.sharpen > 0) sharpen(data, adj.sharpen / 100)
    if (adj.grain > 0) addGrain(data, adj.grain / 100)
    ctx.putImageData(data, 0, 0)
  }

  // 6. Vignette – radial darkening at the edges
  if (adj.vignette > 0) {
    ctx.save()
    const r = Math.sqrt(W * W + H * H) / 2
    const g = ctx.createRadialGradient(W / 2, H / 2, r * 0.35, W / 2, H / 2, r)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, `rgba(0,0,0,${(adj.vignette / 100) * 0.85})`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    ctx.restore()
  }
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
        const neighbours = src[p - 4] + src[p + 4] + src[p - row] + src[p + row]
        data[p] = src[p] + k * (4 * src[p] - neighbours)
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

export function exportImage(img, adj, type = 'image/jpeg', quality = 0.95) {
  const canvas = document.createElement('canvas')
  renderToCanvas(canvas, img, adj)
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}
