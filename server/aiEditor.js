// Server-side AI prompt interpreter. Runs inside the Vite dev/preview server so
// the Anthropic API key stays on the machine and never reaches the browser.
//
// Claude looks at a small copy of the photo + the photographer's prompt (any
// language, any wording) and returns the final adjustment values to apply.

import 'dotenv/config'
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { generativeConfigured, generativeEdit } from './geminiEditor.js'

const MODEL = 'claude-opus-5-5'

const EditSchema = z.object({
  brightness: z.number().describe('percent, 100 = unchanged, range 20-200'),
  contrast: z.number().describe('percent, 100 = unchanged, range 20-200'),
  saturation: z.number().describe('percent, 100 = unchanged, 0 = greyscale, range 0-250'),
  hue: z.number().describe('degrees, 0 = unchanged, range -180..180'),
  warmth: z.number().describe('-100 very cool/blue .. 0 neutral .. 100 very warm/orange'),
  sepia: z.number().describe('0-100'),
  grayscale: z.number().describe('0-100, 100 = black and white'),
  blur: z.number().describe('0-10 px, softness'),
  sharpen: z.number().describe('0-100'),
  vignette: z.number().describe('0-100, darkened edges'),
  fade: z.number().describe('0-100, matte / lifted shadows'),
  grain: z.number().describe('0-100, film grain'),
  rotate: z.number().describe('0, 90, 180 or 270 (clockwise)'),
  flipH: z.boolean(),
  flipV: z.boolean(),
  reply: z.string().describe('One or two short sentences to the photographer, in the same language/script they wrote in, saying what you changed.'),
  limitation: z
    .string()
    .describe('Empty string normally. If part of the request needs generative editing these tools cannot do (removing/adding objects, changing background, face changes), say so briefly here, in the user\'s language.'),
})

const SYSTEM = `You are the editing engine of Stories by Reyansh, a photo editor for professional photographers.
The photographer gives you a photo and an instruction in any language (often English, Marathi or Hindi, in Roman or Devanagari script, sometimes vague like "make it nice" or "lagnasathi bhari kar").

You can only control these global adjustments: brightness, contrast, saturation, hue, warmth, sepia, grayscale, blur, sharpen, vignette, fade, grain, rotate, flipH, flipV.
You receive the CURRENT values. Return the complete NEW values to apply (not deltas).

Rules:
- Always make a visible change that best matches the intent. Never return the current values unchanged unless the user asked to undo or reset (then return the neutral defaults: brightness/contrast/saturation 100, everything else 0/false).
- Look at the photo: if it is underexposed, flat, too cool, etc., correct it in the direction the user wants. For vague requests ("make it better", "professional", "sundar kar"), do a tasteful enhancement suited to this photo.
- Edits build on the current values unless the user asks to start over.
- Translate moods and styles into adjustments (e.g. "romantic" -> warm, soft, slight fade; "horror" -> dark, cool, desaturated, heavy vignette, grain).
- Stay tasteful: photographers want professional results, not extreme filters, unless they ask for strong effects.
- If the request needs something these adjustments cannot do (remove a person, replace sky, change clothes), do the closest possible tonal edit and explain the limitation.`

let client = null
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null
  client ??= new Anthropic()
  return client
}

export async function interpretWithClaude({ prompt, current, image }) {
  const anthropic = getClient()
  if (!anthropic) throw Object.assign(new Error('AI is not configured'), { status: 503 })

  const content = []
  if (image) {
    const [, mediaType, data] = image.match(/^data:(image\/\w+);base64,(.+)$/) ?? []
    if (data) content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data } })
  }
  content.push({
    type: 'text',
    text: `The image shows the photo with these current adjustment values already applied:\n${JSON.stringify(current)}\n\nPhotographer's instruction:\n${prompt}`,
  })

  const response = await anthropic.beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default', // if a request is declined, the API retries on a fallback model
    output_config: { effort: 'low', format: betaZodOutputFormat(EditSchema) },
    system: SYSTEM,
    messages: [{ role: 'user', content }],
  })

  if (response.stop_reason === 'refusal') {
    throw Object.assign(new Error('The AI declined this request.'), { status: 422 })
  }
  if (!response.parsed_output) {
    throw Object.assign(new Error('The AI returned an unreadable answer.'), { status: 502 })
  }
  return response.parsed_output
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (c) => {
      body += c
      if (body.length > 30e6) reject(new Error('Request too large'))
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'))
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject )
  })
}

function send(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

async function middleware(req, res, next) {
  if (req.url === '/api/status' && req.method === 'GET') {
    return send(res, 200, { ai: Boolean(getClient()), generative: generativeConfigured() })
  }
  if (req.url === '/api/generate' && req.method === 'POST') {
    try {
      const body = await readJson(req)
      if (!body.prompt || typeof body.prompt !== 'string') return send(res, 400, { error: 'prompt is required' })
      return send(res, 200, await generativeEdit(body))
    } catch (err) {
      console.error('[Stories AI]', err.message)
      return send(res, err.status ?? 500, { error: err.message })
    }
  }
  if (req.url === '/api/interpret' && req.method === 'POST') {
    try {
      const body = await readJson(req)
      if (!body.prompt || typeof body.prompt !== 'string') return send(res, 400, { error: 'prompt is required' })
      const result = await interpretWithClaude(body)
      return send(res, 200, result)
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) return send(res, 401, { error: 'Invalid Anthropic API key' })
      if (err instanceof Anthropic.RateLimitError) return send(res, 429, { error: 'AI is busy, try again shortly' })
      if (err instanceof Anthropic.APIConnectionError) return send(res, 503, { error: 'Cannot reach the AI service' })
      if (err instanceof Anthropic.APIError) return send(res, 502, { error: `AI error ${err.status}: ${err.message}` })
      console.error('[Stories AI]', err)
      return send(res, err.status ?? 500, { error: err.message })
    }
  }
  next()
}

// Vite plugin: mounts the API on both `npm run dev` and `npm run preview`.
export function storiesAI() {
  return {
    name: 'stories-ai',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
