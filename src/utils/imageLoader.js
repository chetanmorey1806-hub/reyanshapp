// Opens (almost) any photo file a photographer might have:
//   JPG, PNG, WEBP, AVIF, GIF, BMP, SVG  – decoded natively by the browser
//   HEIC / HEIF (iPhone)                 – decoded with heic2any
//   TIFF                                  – decoded with UTIF
//   Camera RAW (CR2, CR3, NEF, ARW, DNG, RAF, ORF, RW2, PEF, SRW…)
//                                         – uses the full-size JPEG preview the camera embeds in the RAW file
//
// The result is always a plain HTMLImageElement so the editor can treat every format the same.

const RAW_EXT = ['cr2', 'cr3', 'crw', 'nef', 'nrw', 'arw', 'srf', 'sr2', 'dng', 'raf', 'orf', 'rw2', 'pef', 'srw', 'x3f', 'kdc', 'mrw', 'erf', '3fr', 'iiq', 'rwl']
const HEIC_EXT = ['heic', 'heif', 'hif']
const TIFF_EXT = ['tif', 'tiff']

export const ACCEPT = ['image/*', ...[...RAW_EXT, ...HEIC_EXT, ...TIFF_EXT].map((e) => '.' + e)].join(',')

const extOf = (name) => (name.match(/\.([^.]+)$/)?.[1] || '').toLowerCase()

function imageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) {
        // e.g. SVG without width/height – give it a sensible size
        img.width = img.width || 2000
        img.height = img.height || 2000
      }
      resolve({ img, url })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('decode failed'))
    }
    img.src = url
  })
}

async function decodeHeic(file) {
  const { default: heic2any } = await import('heic2any')
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.95 })
  return Array.isArray(out) ? out[0] : out
}

async function decodeTiff(buffer) {
  const { default: UTIF } = await import('utif')
  const ifds = UTIF.decode(buffer)
  // pick the largest page (TIFF/DNG files can hold thumbnails too)
  let best = null
  for (const ifd of ifds) {
    try {
      UTIF.decodeImage(buffer, ifd)
      if (ifd.width && ifd.height && (!best || ifd.width * ifd.height > best.width * best.height)) best = ifd
    } catch {
      /* skip pages UTIF can't read */
    }
  }
  if (!best) throw new Error('no readable TIFF page')
  const rgba = UTIF.toRGBA8(best)
  const canvas = document.createElement('canvas')
  canvas.width = best.width
  canvas.height = best.height
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer), best.width, best.height), 0, 0)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

// Camera RAW files embed a full-resolution JPEG preview. Find the largest one.
function extractEmbeddedJpeg(buffer) {
  const bytes = new Uint8Array(buffer)
  let best = null
  for (let i = 0; i < bytes.length - 3; i++) {
    // JPEG start: FF D8 FF
    if (bytes[i] !== 0xff || bytes[i + 1] !== 0xd8 || bytes[i + 2] !== 0xff) continue
    // walk JPEG segments to find its real end (avoids false FF D9 matches)
    let p = i + 2
    let end = -1
    while (p < bytes.length - 1) {
      if (bytes[p] !== 0xff) break
      const marker = bytes[p + 1]
      if (marker === 0xd9) { end = p + 2; break }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { p += 2; continue }
      const len = (bytes[p + 2] << 8) | bytes[p + 3]
      if (marker === 0xda) {
        // start of scan: skip entropy-coded data until next real marker
        p += 2 + len
        while (p < bytes.length - 1 && !(bytes[p] === 0xff && bytes[p + 1] !== 0 && !(bytes[p + 1] >= 0xd0 && bytes[p + 1] <= 0xd7))) p++
        continue
      }
      p += 2 + len
    }
    if (end > 0) {
      const size = end - i
      if (!best || size > best.size) best = { start: i, size }
      i = end - 1
    }
  }
  if (!best || best.size < 20000) return null // ignore tiny thumbnails
  return new Blob([bytes.subarray(best.start, best.start + best.size)], { type: 'image/jpeg' })
}

export async function loadAnyImage(file) {
  const ext = extOf(file.name)

  // 1. Let the browser try first (handles JPG/PNG/WEBP/AVIF/GIF/BMP/SVG, and HEIC/TIFF on Safari)
  if (!RAW_EXT.includes(ext)) {
    try {
      return await imageFromBlob(file)
    } catch {
      /* fall through to special decoders */
    }
  }

  const buffer = await file.arrayBuffer()
  const head = new Uint8Array(buffer, 0, Math.min(12, buffer.byteLength))
  const isTiffMagic = (head[0] === 0x49 && head[1] === 0x49) || (head[0] === 0x4d && head[1] === 0x4d)
  const isHeicMagic = String.fromCharCode(...head.slice(4, 8)) === 'ftyp' && !RAW_EXT.includes(ext)

  // 2. HEIC / HEIF
  if (HEIC_EXT.includes(ext) || isHeicMagic) {
    try {
      return await imageFromBlob(await decodeHeic(file))
    } catch {
      throw new Error('This HEIC photo could not be decoded. Try exporting it as JPG from your phone.')
    }
  }

  // 3. Camera RAW – embedded preview first, then TIFF decoding (works for many DNGs)
  if (RAW_EXT.includes(ext)) {
    const jpeg = extractEmbeddedJpeg(buffer)
    if (jpeg) {
      try {
        return await imageFromBlob(jpeg)
      } catch {
        /* try TIFF next */
      }
    }
    if (isTiffMagic) {
      try {
        return await imageFromBlob(await decodeTiff(buffer))
      } catch {
        /* fall through */
      }
    }
    throw new Error(`Could not read this .${ext} RAW file. Please export it as JPG/TIFF from your camera software.`)
  }

  // 4. TIFF (or unknown file that is TIFF inside)
  if (TIFF_EXT.includes(ext) || isTiffMagic) {
    try {
      return await imageFromBlob(await decodeTiff(buffer))
    } catch {
      throw new Error('This TIFF file could not be decoded.')
    }
  }

  // 5. Last chance: maybe it's a JPEG/PNG with a wrong extension or embedded image
  const jpeg = extractEmbeddedJpeg(buffer)
  if (jpeg) return imageFromBlob(jpeg)

  throw new Error(
    `"${file.name}" is not a photo format CandyClick can open. Supported: JPG, PNG, WEBP, AVIF, HEIC, TIFF, GIF, BMP and camera RAW (CR2, CR3, NEF, ARW, DNG, RAF, ORF, RW2…).`,
  )
}
