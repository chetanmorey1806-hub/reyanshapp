import { DEFAULT_ADJUSTMENTS, clampAdjustments } from './adjustments.js'

// Turns a free-text prompt (English / Marathi / Hindi, Roman or Devanagari)
// into changes on the adjustment values.
//
//   "make it brighter and warm"         -> brightness +, warmth +
//   "thoda ujed kar ani vintage look de" -> brightness + (small), vintage preset
//   "contrast 30 vadhav, rotate right"   -> contrast +30, rotate 90°

// ---- intensity & direction words -------------------------------------------
const STRONG = /\b(very|much|lot|lots|really|super|extra|khup|khoop|jast|jasta|jaast|bahut|zyada|jyada|jada|strong|heavy|more and more)\b|खूप|जास्त|बहुत|ज़्यादा|ज्यादा/i
const SLIGHT = /\b(slight|slightly|little|bit|tad|thoda|thodi|thodasa|halka|halke|light ?ly|subtle|subtly|kinchit)\b|थोडा|थोडी|थोडं|हल्का|हलका|किंचित/i
const LESS = /\b(less|reduce|decrease|lower|remove|kami|kam|ghatav|hatav|kadh|no more|without|minus)\b|कमी|कम|घटव|हटव|काढ|हटा/i

// ---- rules -----------------------------------------------------------------
// apply(adj, amount) mutates adj. `amount` = step * intensity * direction,
// or the number the user typed (e.g. "brightness 30").
const RULES = [
  // presets first (they read best as whole looks)
  {
    name: 'Vintage look',
    match: /vintage|retro|old ?(school|photo|look)|juna|june|purana|जुना|जुनी|पुराना|पुरानी|70s|80s|90s/i,
    apply: (a, f) => {
      a.sepia += 45 * f; a.fade += 25 * f; a.contrast -= 8 * f
      a.saturation -= 15 * f; a.vignette += 30 * f; a.grain += 20 * f; a.warmth += 10 * f
    },
  },
  {
    name: 'Cinematic look',
    match: /cinematic|movie|film look|filmy|hollywood|bollywood|सिनेमॅटिक|फिल्मी/i,
    apply: (a, f) => {
      a.contrast += 18 * f; a.saturation -= 12 * f; a.warmth += 8 * f
      a.vignette += 35 * f; a.fade += 10 * f; a.sharpen += 15 * f
    },
  },
  {
    name: 'Dramatic look',
    match: /dramatic|drama|intense|epic|ड्रामॅटिक/i,
    apply: (a, f) => {
      a.contrast += 35 * f; a.brightness -= 8 * f; a.saturation -= 8 * f
      a.vignette += 50 * f; a.sharpen += 30 * f
    },
  },
  {
    name: 'Moody look',
    match: /moody|mood|gloomy|sad|udas|उदास|dark and moody/i,
    apply: (a, f) => {
      a.brightness -= 12 * f; a.saturation -= 25 * f; a.contrast += 10 * f
      a.vignette += 40 * f; a.warmth -= 12 * f; a.fade += 10 * f
    },
  },
  {
    name: 'Noir look',
    match: /\bnoir\b/i,
    apply: (a, f) => { a.grayscale += 100 * f; a.contrast += 40 * f; a.vignette += 50 * f; a.grain += 15 * f },
  },
  {
    name: 'Wedding look',
    match: /wedding|lagna|lagn|shaadi|shadi|लग्न|शादी|bridal|bride/i,
    apply: (a, f) => {
      a.brightness += 10 * f; a.warmth += 15 * f; a.fade += 15 * f
      a.saturation -= 5 * f; a.contrast -= 5 * f; a.vignette += 15 * f
    },
  },
  {
    name: 'Portrait look',
    match: /portrait|skin|face|chehra|chehera|चेहरा|soft skin|glow/i,
    apply: (a, f) => {
      a.brightness += 6 * f; a.warmth += 10 * f; a.contrast -= 4 * f
      a.blur += 0.4 * f; a.vignette += 20 * f
    },
  },
  {
    name: 'Instagram pop',
    match: /insta|instagram|pop|social|punchy/i,
    apply: (a, f) => { a.contrast += 15 * f; a.saturation += 25 * f; a.sharpen += 20 * f; a.brightness += 4 * f },
  },
  {
    name: 'HDR look',
    match: /\bhdr\b|high dynamic|detail|details/i,
    apply: (a, f) => { a.contrast += 25 * f; a.saturation += 20 * f; a.sharpen += 50 * f },
  },
  {
    name: 'Sunny / summer look',
    match: /sunny|summer|sunshine|unhala|उन्हाळा|garmi|गर्मी|daylight/i,
    apply: (a, f) => { a.brightness += 10 * f; a.warmth += 25 * f; a.saturation += 15 * f },
  },
  {
    name: 'Sunset / golden hour',
    match: /sunset|golden hour|evening|sandhyakal|sandhyakaal|संध्याकाळ|शाम|sham/i,
    apply: (a, f) => { a.warmth += 40 * f; a.saturation += 15 * f; a.contrast += 8 * f; a.vignette += 20 * f },
  },
  {
    name: 'Night look',
    match: /night|ratri|raat|रात्र|रात/i,
    apply: (a, f) => { a.brightness -= 20 * f; a.warmth -= 30 * f; a.contrast += 10 * f; a.vignette += 30 * f },
  },
  {
    name: 'Food look',
    match: /food|jevan|khana|जेवण|खाना|dish|restaurant/i,
    apply: (a, f) => { a.saturation += 20 * f; a.warmth += 12 * f; a.sharpen += 25 * f; a.contrast += 10 * f; a.brightness += 5 * f },
  },
  {
    name: 'Candy / pastel look',
    match: /candy|pastel|soft colou?r|dream|swapn|स्वप्न|सपना|fairy|magical/i,
    apply: (a, f) => { a.brightness += 8 * f; a.fade += 25 * f; a.contrast -= 10 * f; a.saturation += 10 * f; a.hue -= 6 * f },
  },
  {
    name: 'Nature / landscape',
    match: /nature|landscape|green|greenery|nisarg|निसर्ग|hariyali|हिरवा|trees|mountain/i,
    apply: (a, f) => { a.saturation += 22 * f; a.contrast += 10 * f; a.sharpen += 25 * f },
  },

  // single adjustments
  {
    name: 'Black & white',
    match: /blackwhite|black ?white|\bb ?& ?w\b|\bbw\b|gr[ae]yscale|monochrome|kala ?pandhra|काळा ?पांढरा|काळापांढरा|कालासफ़ेद|ब्लॅक ?(अँड|ॲंड)? ?व्हाइट|काला ?सफ़ेद|colou?rless/i,
    apply: (a, f) => { a.grayscale += 100 * f },
  },
  {
    name: 'Sepia',
    match: /sepia|brownish|brown tone/i,
    apply: (a, f) => { a.sepia += 60 * f },
  },
  {
    name: 'Brightness',
    match: /bright|brighten|lighter|lighten|exposure|ujed|ujjed|ujala|ujal|उजेड|उजळ|उजाला|prakash|प्रकाश|roshni|रोशनी|\blight(er|en)?\b/i,
    step: 15,
    apply: (a, f) => { a.brightness += f },
  },
  {
    name: 'Vignette',
    match: /vignette|dark (edges|corners)|corners? dark|vinyet/i,
    step: 40,
    apply: (a, f) => { a.vignette += f },
  },
  {
    name: 'Darker',
    match: /dark|darker|darken|dim|andhar|andhaar|अंधार|gadad|गडद|andhera|अंधेरा|underexpose/i,
    step: 15,
    apply: (a, f) => { a.brightness -= f },
  },
  {
    name: 'Contrast',
    match: /contrast|कॉन्ट्रास्ट|कंट्रास्ट/i,
    step: 20,
    apply: (a, f) => { a.contrast += f },
  },
  {
    name: 'Muted colours',
    match: /muted|dull|desaturat|washed|feeka|fika|फिका|फीका/i,
    step: 30,
    apply: (a, f) => { a.saturation -= f },
  },
  {
    name: 'Colour / saturation',
    match: /saturat|colou?rful|vibran|vivid|rich colou?r|colou?rs?|rang|रंग|kalarful|कलरफुल/i,
    step: 25,
    apply: (a, f) => { a.saturation += f },
  },
  {
    name: 'Warm tone',
    match: /warm|golden|orange|yellowish|ubdar|उबदार|garam|गरम/i,
    step: 30,
    apply: (a, f) => { a.warmth += f },
  },
  {
    name: 'Cool tone',
    match: /cool|cold|blue|bluish|icy|thand|थंड|ठंडा|winter|hivala|हिवाळा/i,
    step: 30,
    apply: (a, f) => { a.warmth -= f },
  },
  {
    name: 'Hue shift',
    match: /\bhue\b|tint|shift colou?r/i,
    step: 30,
    apply: (a, f) => { a.hue += f },
  },
  {
    name: 'Sharpen',
    match: /sharp|crisp|clear|clarity|spasht|स्पष्ट|saaf|साफ|focus|tikshna|तीक्ष्ण/i,
    step: 35,
    apply: (a, f) => { a.sharpen += f },
  },
  {
    name: 'Blur / soft',
    match: /blur|soft|smooth|dhusar|धूसर|dhundla|धुंधला/i,
    step: 1.5,
    apply: (a, f) => { a.blur += f },
  },
  {
    name: 'Film grain',
    match: /grain|grainy|noise|film/i,
    step: 25,
    apply: (a, f) => { a.grain += f },
  },
  {
    name: 'Fade / matte',
    match: /fade|faded|matte|matt|haze|hazy/i,
    step: 30,
    apply: (a, f) => { a.fade += f },
  },
]

// Rotation / flip handled separately – they are not "intensity" based.
function applyGeometry(clause, adj, applied) {
  const t = clause.toLowerCase()
  if (/rotate|rotation|turn|firav|phirav|फिरव|घुमा|ghuma/.test(t)) {
    const deg = t.match(/(-?\d+)\s*(deg|°|degree)?/)
    let delta = 90
    if (deg) delta = parseInt(deg[1], 10)
    else if (/left|dav|डाव|baye|बाएं|anti|counter/.test(t)) delta = -90
    else if (/upside|ulta|उलट|180/.test(t)) delta = 180
    delta = Math.round(delta / 90) * 90
    adj.rotate += delta
    applied.push(`Rotate ${delta > 0 ? '+' : ''}${delta}°`)
    return true
  }
  if (/flip|mirror|ulat|उलट|palat|पलट/.test(t)) {
    if (/vertical|upside|up ?down|var ?khali|वर ?खाली/.test(t)) {
      adj.flipV = !adj.flipV
      applied.push('Flip vertical')
    } else {
      adj.flipH = !adj.flipH
      applied.push('Flip horizontal (mirror)')
    }
    return true
  }
  return false
}

const RESET = /^\s*(reset|original|start over|clear all|undo all|mul|mool|मूळ|पहिल्यासारखा|रीसेट)\b/i

/**
 * @returns {{ adjustments: object, applied: string[], unknown: string[], reset: boolean }}
 */
export function interpretPrompt(prompt, current) {
  const adj = { ...current }
  const applied = []
  const unknown = []

  if (RESET.test(prompt)) {
    return { adjustments: { ...DEFAULT_ADJUSTMENTS }, applied: ['Reset to original'], unknown, reset: true }
  }

  // Protect phrases that contain a splitter word ("black and white").
  prompt = prompt
    .replace(/black\s*(and|&|n|\+)\s*white/gi, 'blackwhite')
    .replace(/काळा\s*(आणि|व)?\s*पांढरा/g, 'काळापांढरा')
    .replace(/काला\s*(और)?\s*सफ़ेद/g, 'कालासफ़ेद')

  // Split into clauses so "brighter and less contrast" is handled per part.
  const clauses = prompt
    .split(/,|;|\.|\band\b|\bthen\b|\bani\b|\baani\b|\baur\b|\bplus\b|\bwith\b|\balso\b|आणि|और|\n/i)
    .map((c) => c.trim())
    .filter(Boolean)

  for (const clause of clauses) {
    if (applyGeometry(clause, adj, applied)) continue

    let intensity = 1
    if (STRONG.test(clause)) intensity = 1.8
    else if (SLIGHT.test(clause)) intensity = 0.5
    const direction = LESS.test(clause) ? -1 : 1
    const numMatch = clause.match(/[-+]?\d+(\.\d+)?/)

    // Apply every rule that matches ("warm cinematic look" = warm + cinematic).
    // Matched words are removed so overlapping rules don't double-apply
    // ("dark edges" is a vignette, not "darker").
    let matched = false
    let rest = clause
    for (const rule of RULES) {
      const m = rest.match(rule.match)
      if (!m) continue
      rest = rest.replace(m[0], ' ')
      matched = true
      let amount
      if (rule.step !== undefined) {
        amount = numMatch ? Math.abs(parseFloat(numMatch[0])) : rule.step * intensity
        if (rule.name === 'Blur / soft' && numMatch) amount = Math.min(10, amount)
        amount *= direction
      } else {
        amount = intensity * direction // presets: multiplier
      }
      rule.apply(adj, amount)
      const label =
        direction < 0
          ? `Less ${rule.name.toLowerCase()}`
          : intensity > 1
            ? `${rule.name} (strong)`
            : intensity < 1
              ? `${rule.name} (subtle)`
              : rule.name
      applied.push(numMatch && rule.step !== undefined ? `${rule.name} ${direction < 0 ? '−' : '+'}${Math.abs(amount)}` : label)
    }
    if (!matched) unknown.push(clause)
  }

  return { adjustments: clampAdjustments(adj), applied, unknown, reset: false }
}

export const PROMPT_SUGGESTIONS = [
  'Make it brighter and warm',
  'Cinematic look',
  'Black and white with strong contrast',
  'Vintage film look',
  'Wedding look, soft and warm',
  'थोडा उजेड वाढव आणि रंग जास्त',
  'Moody and dark',
  'Sunset golden hour',
  'Sharp and colourful (HDR)',
  'Rotate right',
]
