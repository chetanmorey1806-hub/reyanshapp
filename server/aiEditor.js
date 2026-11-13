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

const PRESET_NAMES = ['Original', 'Auto Pro', 'Vivid', 'Warm Glow', 'Cool Crisp', 'Cinematic', 'Teal & Orange', 'Wedding', 'Pastel', 'Matte Film', 'Vintage', 'Golden Hour', 'Moody', 'Portrait', 'Food', 'Landscape', 'Night', 'B&W Classic', 'Noir', 'Sepia']
const FONT_NAMES = ['Inter', 'Montserrat', 'Playfair Display', 'Instrument Serif', 'Bebas Neue', 'Dancing Script', 'Great Vibes', 'Noto Sans Devanagari']

const TextLayer = z.object({
  text: z.string().describe('exact text to show, in the script the user wants'),
  position: z.enum(['top', 'center', 'bottom']),
  size: z.enum(['small', 'medium', 'large']),
  color: z.string().describe('CSS hex colour, e.g. #ffffff'),
  font: z.enum(FONT_NAMES).describe('Noto Sans Devanagari for Marathi/Hindi unless a style is asked'),
})

const EditSchema = z.object({
  useGenerative: z
    .boolean()
    .describe('true if the request changes the CONTENT of the photo (remove/add/replace objects or people, background, sky, clothes, face/body retouching, restoration, colourising, art style, anything the sliders cannot do exactly). Only allowed when generative editing is available.'),
  generativePrompt: z.string().describe('When useGenerative: a precise English instruction for an image-editing model that does exactly what the user asked and keeps everything else unchanged. Otherwise empty.'),
  exposure: z.number().describe('-100..100, 0 = unchanged (±100 = ±2 stops)'),
  brightness: z.number().describe('percent, 100 = unchanged, range 20-200'),
  contrast: z.number().describe('percent, 100 = unchanged, range 20-200'),
  highlights: z.number().describe('-100..100, negative recovers bright areas/sky'),
  shadows: z.number().describe('-100..100, positive lifts dark areas'),
  whites: z.number().describe('-100..100'),
  blacks: z.number().describe('-100..100'),
  warmth: z.number().describe('-100 very cool/blue .. 0 neutral .. 100 very warm/orange'),
  tint: z.number().describe('-100 green .. 0 .. 100 magenta'),
  vibrance: z.number().describe('-100..100, smart saturation'),
  saturation: z.number().describe('percent, 100 = unchanged, 0 = greyscale, range 0-250'),
  hue: z.number().describe('degrees, 0 = unchanged, range -180..180'),
  clarity: z.number().describe('-100..100 local contrast; negative = soft skin'),
  sharpen: z.number().describe('0-100'),
  blur: z.number().describe('0-10 px, softness'),
  vignette: z.number().describe('0-100, darkened edges'),
  fade: z.number().describe('0-100, matte / lifted shadows'),
  grain: z.number().describe('0-100, film grain'),
  sepia: z.number().describe('0-100'),
  grayscale: z.number().describe('0-100, 100 = black and white'),
  rotate: z.number().describe('0, 90, 180 or 270 (clockwise)'),
  straighten: z.number().describe('-45..45 degrees fine rotation'),
  flipH: z.boolean(),
  flipV: z.boolean(),
  cropAspect: z.enum(['keep', 'none', '1:1', '4:5', '9:16', '16:9', '3:2', '2:3', '4:3']).describe('keep = leave crop as is, none = remove crop'),
  frame: z.number().describe('border size 0-20 (% of shorter side), 0 = none'),
  frameColor: z.string().describe('hex colour of the border'),
  addTexts: z.array(TextLayer).describe('text / emoji layers to ADD (empty if none requested)'),
  removeAllTexts: z.boolean(),
  reply: z.string().describe('One or two short sentences to the photographer, in the same language/script they wrote in, saying what you changed.'),
  limitation: z.string().describe('Empty string normally. If part of the request cannot be done, say so briefly here in the user\'s language.'),
})

const SYSTEM = `You are the editing engine of Stories by Reyansh, a professional photo editor for photographers.
The photographer gives you a photo and an instruction in any language (English, Marathi or Hindi, Roman or Devanagari script, often typed or spoken casually, e.g. "lagnasathi bhari kar", "background badal", "maage cha manus kadh").

Your job: do EXACTLY what they ask.
You control two engines:
1. Non-destructive adjustments (full resolution): exposure, brightness, contrast, highlights, shadows, whites, blacks, warmth, tint, vibrance, saturation, hue, clarity, sharpen, blur, vignette, fade, grain, sepia, grayscale, rotate, straighten, flips, crop aspect, border frame, text/emoji layers.
2. Generative editing (an image model that repaints the photo) – only if GENERATIVE AVAILABLE is yes.

Routing:
- Light, colour, tone, looks/moods, crop, rotate, border, adding text/captions/emoji → adjustments (never generative for these, it lowers resolution).
- Anything that changes content (remove/add/replace objects or people, change background or sky, change clothes/hair/makeup, face or body retouch, fix blemishes, open eyes, restore old/damaged photo, colourise, change season/weather, art styles like cartoon/anime/painting, extend the image) → useGenerative = true with a precise English generativePrompt. When generative is used, return the CURRENT adjustment values unchanged.
- If generative is needed but NOT available: do the closest adjustment edit and explain in "limitation".

Adjustment rules:
- You receive the CURRENT values. Return the complete NEW values (not deltas). Edits build on current values unless the user asks to start over / reset (then neutral: brightness/contrast/saturation 100, everything else 0/false, cropAspect "none").
- Always make a visible change matching the intent. Look at the photo: correct exposure / colour cast in the direction the user wants. For vague requests ("make it better", "professional", "sundar kar") do a tasteful pro enhancement suited to this photo.
- Translate moods into adjustments (romantic → warm, soft, lifted shadows; horror → dark, cool, desaturated, heavy vignette, grain; wedding → bright, warm, soft highlights).
- Stay tasteful unless strong effects are asked.
- Text: put the exact words the user gave (keep their script). For names/greetings with no position given use bottom.`

const VideoText = z.object({
  text: z.string(),
  start: z.number().describe('seconds from the start of the video'),
  end: z.number().describe('seconds; use the total duration for "whole video"'),
  position: z.enum(['top', 'center', 'bottom']),
  animation: z.enum(['fade', 'pop', 'slide', 'typewriter', 'scroll', 'credits']).describe('scroll = ticker moving right to left, credits = moving bottom to top'),
  size: z.enum(['small', 'medium', 'large']),
  color: z.string().describe('hex colour'),
  font: z.enum(FONT_NAMES),
})

const VideoPlanSchema = z.object({
  aspect: z.enum(['keep', '9:16', '16:9', '1:1', '4:5']).describe('9:16 for reels/shorts/status/stories'),
  filter: z.enum(['keep', ...PRESET_NAMES]),
  filterAmount: z.number().describe('0-100, -1 = keep'),
  transition: z.enum(['keep', 'none', 'fade', 'slide', 'zoom', 'wipe', 'flash', 'blur']),
  transitionDuration: z.number().describe('seconds 0.2-2, -1 = keep'),
  imageDuration: z.number().describe('seconds each photo stays on screen, -1 = keep'),
  speed: z.number().describe('playback speed for video clips, 0.25-4 (0.5 = slow motion), -1 = keep'),
  kenBurns: z.enum(['keep', 'on', 'off']).describe('slow zoom/pan on photos'),
  fit: z.enum(['keep', 'cover', 'contain', 'blur']).describe('cover = fill frame, blur = whole photo on blurred background'),
  addTexts: z.array(VideoText),
  removeAllTexts: z.boolean(),
  music: z.enum(['keep', 'none', 'romantic', 'upbeat', 'cinematic', 'calm', 'festive', 'sad', 'lofi']).describe('built-in generated background music by mood'),
  musicVolume: z.number().describe('0-100, -1 = keep'),
  originalAudioVolume: z.number().describe('volume of the clips own sound 0-100, -1 = keep (0 = mute)'),
  order: z.enum(['keep', 'reverse', 'shuffle']),
  targetDuration: z.number().describe('desired total length in seconds (e.g. 15, 30, 60 for reels), -1 = keep'),
  reply: z.string().describe('One or two short sentences in the user\'s language/script describing what you did'),
  limitation: z.string().describe('Empty normally; explain briefly anything you could not do'),
})

const VIDEO_SYSTEM = `You are the video editing engine of Stories by Reyansh, a video & reel editor for professional photographers.
The user describes the video or reel they want in any language (English, Marathi, Hindi; Roman or Devanagari; typed or spoken).
You receive the current project (clips, durations, settings). Return a plan with the settings to change; use "keep" / -1 for anything that should stay the same.
Do exactly what is asked. For a general request like "make a wedding reel" or "reel banav" choose a complete professional setup (9:16, a fitting look, transitions, photo duration, Ken Burns, music mood, a title text if a name/occasion is mentioned).
Text times must be within the total duration. Keep text in the user's script. Use Noto Sans Devanagari for Devanagari text.
You cannot generate new footage or download songs; music is a built-in generated track by mood (the user can also upload their own song).`
let client = null
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null
  client ??= new Anthropic()
  return client
}

export async function interpretWithClaude({ prompt, current, image }) {
  const generative = generativeConfigured()
  const anthropic = getClient()
  if (!anthropic) throw Object.assign(new Error('AI is not configured'), { status: 503 })

  const content = []
  if (image) {
    const [, mediaType, data] = image.match(/^data:(image\/\w+);base64,(.+)$/) ?? []
    if (data) content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data } })
  }
  content.push({
    type: 'text',
    text: `GENERATIVE AVAILABLE: ${generative ? 'yes' : 'no'}\n\nThe image shows the photo with these current adjustment values already applied:\n${JSON.stringify(current)}\n\nPhotographer's instruction:\n${prompt}`,
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
  const out = response.parsed_output
  if (!generative) out.useGenerative = false
  return out
}

export async function planVideoWithClaude({ prompt, project }) {
  const anthropic = getClient()
  if (!anthropic) throw Object.assign(new Error('AI is not configured'), { status: 503 })
  const response = await anthropic.beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(VideoPlanSchema) },
    system: VIDEO_SYSTEM,
    messages: [{ role: 'user', content: `Current project:\n${JSON.stringify(project)}\n\nUser's request:\n${prompt}` }],
  })
  if (response.stop_reason === 'refusal') throw Object.assign(new Error('The AI declined this request.'), { status: 422 })
  if (!response.parsed_output) throw Object.assign(new Error('The AI returned an unreadable answer.'), { status: 502 })
  return response.parsed_output
}

function apiError(res, err) {
  if (err instanceof Anthropic.AuthenticationError) return send(res, 401, { error: 'Invalid Anthropic API key' })
  if (err instanceof Anthropic.RateLimitError) return send(res, 429, { error: 'AI is busy, try again shortly' })
  if (err instanceof Anthropic.APIConnectionError) return send(res, 503, { error: 'Cannot reach the AI service' })
  if (err instanceof Anthropic.APIError) return send(res, 502, { error: `AI error ${err.status}: ${err.message}` })
  console.error('[Stories AI]', err)
  return send(res, err.status ?? 500, { error: err.message })
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (c) => {
      body += c
      if (body.length > 40e6) reject(new Error('Request too large'))
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
      return send(res, 200, await interpretWithClaude(body))
    } catch (err) {
      return apiError(res, err)
    }
  }
  if (req.url === '/api/video-plan' && req.method === 'POST') {
    try {
      const body = await readJson(req)
      if (!body.prompt || typeof body.prompt !== 'string') return send(res, 400, { error: 'prompt is required' })
      return send(res, 200, await planVideoWithClaude(body))
    } catch (err) {
      return apiError(res, err)
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
