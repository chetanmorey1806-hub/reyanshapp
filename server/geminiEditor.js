// Generative photo editing (like the Gemini app): the model receives the photo
// + the prompt and returns a NEW image. This handles any request, e.g.
// "remove the person in the back", "change the sky to sunset", "add rain",
// "make me wear a red saree", as well as colour/light edits.
//
// Enabled when GEMINI_API_KEY is set in .env. Model can be changed with
// GEMINI_IMAGE_MODEL (gemini-3-pro-image-preview gives up to 4K output).

import 'dotenv/config'

const DEFAULT_MODEL = 'gemini-2.5-flash-image'

// Aspect ratios the Gemini image models accept
const RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']

function nearestRatio(width, height) {
  if (!width || !height) return undefined
  const target = Math.log(width / height)
  let best = RATIOS[0]
  let bestDiff = Infinity
  for (const r of RATIOS) {
    const [a, b] = r.split(':').map(Number)
    const diff = Math.abs(Math.log(a / b) - target)
    if (diff < bestDiff) [best, bestDiff] = [r, diff]
  }
  return best
}

export function generativeConfigured() {
  return Boolean(process.env.GEMINI_API_KEY)
}

const INSTRUCTION = (prompt) => `You are an expert photo editor. Edit the attached photograph so that it matches the request below EXACTLY and completely.

Rules:
- Do precisely what is asked, nothing less and nothing more. If the request has several parts, do every part.
- Keep everything that is not mentioned identical to the original: same people, same faces and identity, same expressions, pose, clothing, framing, composition, camera angle and aspect ratio.
- The result must look like a real, high-quality, photorealistic photograph (unless the request asks for an artistic style).
- Do not add text, watermarks, borders or frames unless asked.
- Always return the edited image.

Request (may be in English, Marathi or Hindi, in Roman or Devanagari script):
${prompt}`

async function callGemini({ key, model, prompt, mimeType, data, width, height }) {
  const generationConfig = { responseModalities: ['TEXT', 'IMAGE'] }
  const imageConfig = {}
  const aspectRatio = nearestRatio(width, height)
  if (aspectRatio) imageConfig.aspectRatio = aspectRatio
  if (/gemini-3/.test(model)) imageConfig.imageSize = process.env.GEMINI_IMAGE_SIZE || '2K'
  if (Object.keys(imageConfig).length) generationConfig.imageConfig = imageConfig

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mimeType, data } }, { text: INSTRUCTION(prompt) }] }],
      generationConfig,
    }),
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = json?.error?.message || `HTTP ${res.status}`
    throw Object.assign(new Error(`Gemini: ${msg}`), { status: res.status === 429 ? 429 : 502 })
  }

  const parts = json?.candidates?.[0]?.content?.parts ?? []
  const imgPart = parts.find((p) => p.inlineData?.data || p.inline_data?.data)
  const text = parts.map((p) => p.text).filter(Boolean).join(' ').trim()
  const reason = json?.candidates?.[0]?.finishReason || json?.promptFeedback?.blockReason
  return { imgPart, text, reason }
}

export async function generativeEdit({ prompt, image, width, height }) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw Object.assign(new Error('Generative editing is not configured'), { status: 503 })

  const [, mimeType, data] = image?.match(/^data:(image\/[\w+.-]+);base64,(.+)$/) ?? []
  if (!data) throw Object.assign(new Error('image is required'), { status: 400 })

  const model = process.env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL

  // The model sometimes answers with text only; ask again once before giving up.
  let result
  for (let attempt = 0; attempt < 2; attempt++) {
    result = await callGemini({ key, model, prompt, mimeType, data, width, height })
    if (result.imgPart) break
    if (/SAFETY|PROHIBITED|BLOCK/i.test(result.reason ?? '')) break
  }

  const { imgPart, text, reason } = result
  if (!imgPart) {
    throw Object.assign(new Error(text || `No image returned${reason ? ` (${reason})` : ''}`), { status: 422 })
  }
  const inline = imgPart.inlineData ?? imgPart.inline_data
  return {
    image: `data:${inline.mimeType ?? inline.mime_type ?? 'image/png'};base64,${inline.data}`,
    reply: text,
  }
}
