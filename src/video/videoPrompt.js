// Offline understanding of video / reel prompts (English, Marathi, Hindi).
// Produces the same "plan" shape as the AI (/api/video-plan) so both are applied the same way.

export const EMPTY_PLAN = {
  aspect: 'keep',
  filter: 'keep',
  filterAmount: -1,
  transition: 'keep',
  transitionDuration: -1,
  imageDuration: -1,
  speed: -1,
  kenBurns: 'keep',
  fit: 'keep',
  addTexts: [],
  removeAllTexts: false,
  music: 'keep',
  musicVolume: -1,
  originalAudioVolume: -1,
  order: 'keep',
  targetDuration: -1,
}

const has = (re, s) => re.test(s)

const OCCASIONS = [
  { re: /wedding|lagna|lagn|शादी|shaadi|लग्न|bride|groom|engagement|sakharpuda|साखरपुडा|haldi|हळद|mehendi|pre.?wedding/i, filter: 'Wedding', music: 'romantic', label: 'Wedding' },
  { re: /romantic|love|prem|प्रेम|pyar|प्यार|couple|valentine/i, filter: 'Warm Glow', music: 'romantic', label: 'Romantic' },
  { re: /birthday|vadhdivas|वाढदिवस|janmdin|जन्मदिन|bday/i, filter: 'Vivid', music: 'upbeat', label: 'Birthday' },
  { re: /diwali|दिवाळी|दिवाली|ganpati|गणपती|ganesh|navratri|नवरात्र|holi|होळी|festival|sann|सण|त्योहार|tyohar|dhol|ढोल|puja|पूजा/i, filter: 'Golden Hour', music: 'festive', label: 'Festive' },
  { re: /party|dance|dj|club|fun|masti|मस्ती|energetic|upbeat|happy|khush/i, filter: 'Vivid', music: 'upbeat', label: 'Party' },
  { re: /travel|trip|tour|safar|सफर|pravas|प्रवास|vacation|holiday|nature|nisarg|निसर्ग|mountain|beach/i, filter: 'Landscape', music: 'calm', label: 'Travel' },
  { re: /cinematic|movie|film|epic|trailer|filmy/i, filter: 'Cinematic', music: 'cinematic', label: 'Cinematic' },
  { re: /sad|emotional|bhavuk|भावुक|memories|aathvan|आठवण|yaad|याद|tribute|shraddhanjali/i, filter: 'Matte Film', music: 'sad', label: 'Emotional' },
  { re: /lofi|lo-fi|chill|aesthetic/i, filter: 'Matte Film', music: 'lofi', label: 'Lo-fi' },
  { re: /calm|peaceful|shant|शांत|relax|soft/i, filter: 'Pastel', music: 'calm', label: 'Calm' },
]

const FILTERS = [
  [/black ?(and|&|n) ?white|b ?& ?w|\bbw\b|kala ?pandhra|काळा ?पांढरा|monochrome/i, 'B&W Classic'],
  [/\bnoir\b/i, 'Noir'],
  [/vintage|retro|old|juna|जुना|purana/i, 'Vintage'],
  [/teal|orange/i, 'Teal & Orange'],
  [/golden|sunset|warm|ubdar|उबदार/i, 'Golden Hour'],
  [/cool|cold|blue|thand|थंड/i, 'Cool Crisp'],
  [/moody|dark|gloomy/i, 'Moody'],
  [/pastel|dreamy/i, 'Pastel'],
  [/vivid|colou?rful|bright|rang|रंग/i, 'Vivid'],
  [/matte|faded/i, 'Matte Film'],
  [/sepia/i, 'Sepia'],
  [/night|raat|ratri/i, 'Night'],
  [/no filter|original colou?r|remove filter/i, 'Original'],
]

export function interpretVideoPrompt(text, { total = 0 } = {}) {
  const s = text.toLowerCase()
  const plan = { ...EMPTY_PLAN, addTexts: [] }
  const applied = []

  const makeReel = has(/\breels?\b|रील|short(s)?\b|story|status|insta|tiktok|video (banav|bana|kar)|make (a |an )?(reel|video|slideshow)|banav|बनव|बना(ओ|दो|व)|slideshow/i, s)

  // format
  if (has(/\breels?\b|रील|shorts?\b|story|status|vertical|tiktok|9 ?: ?16|insta(gram)? reel/i, s)) { plan.aspect = '9:16'; applied.push('Reel 9:16') }
  else if (has(/youtube|landscape|horizontal|wide|16 ?: ?9/i, s)) { plan.aspect = '16:9'; applied.push('Landscape 16:9') }
  else if (has(/square|1 ?: ?1|insta(gram)? post/i, s)) { plan.aspect = '1:1'; applied.push('Square 1:1') }
  else if (has(/4 ?: ?5|portrait/i, s)) { plan.aspect = '4:5'; applied.push('Portrait 4:5') }

  // occasion → full look
  const occ = OCCASIONS.find((o) => o.re.test(s))

  // filter
  const f = FILTERS.find(([re]) => re.test(s))
  if (f) { plan.filter = f[1]; applied.push(`${f[1]} look`) }
  else if (occ) { plan.filter = occ.filter; applied.push(`${occ.filter} look`) }

  // transitions
  const tr = [
    [/no transition|without transition|hard cut|\bcut\b/i, 'none'],
    [/flash|white flash/i, 'flash'],
    [/slide|swipe/i, 'slide'],
    [/zoom transition|zoom in|zoom/i, 'zoom'],
    [/wipe/i, 'wipe'],
    [/blur transition|blur/i, 'blur'],
    [/fade|dissolve|smooth|crossfade/i, 'fade'],
  ].find(([re]) => re.test(s))
  if (tr) { plan.transition = tr[1]; applied.push(tr[1] === 'none' ? 'No transitions' : `${tr[1][0].toUpperCase() + tr[1].slice(1)} transitions`) }

  // speed
  if (has(/slow ?mo(tion)?|slow|halu|हळू|dheere|धीरे|dhire/i, s)) { plan.speed = 0.5; applied.push('Slow motion 0.5×') }
  else if (has(/time ?lapse/i, s)) { plan.speed = 4; applied.push('Timelapse 4×') }
  else if (has(/fast|speed ?up|jalad|जलद|tez|तेज|jaldi|जल्दी|2x/i, s)) { plan.speed = 2; applied.push('Fast 2×') }
  if (has(/normal speed|1x/i, s)) { plan.speed = 1; applied.push('Normal speed') }

  // durations: "3 sec each photo" / "15 second reel"
  const sec = s.match(/(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds|सेकंद|सेकंड|sekand)\b/)
  if (sec) {
    const v = parseFloat(sec[1])
    if (has(/each|per|every|pratyek|प्रत्येक|har|हर|photo|image|pic/i, s) && v <= 15) { plan.imageDuration = v; applied.push(`${v}s per photo`) }
    else { plan.targetDuration = v; applied.push(`${v}s long`) }
  }
  const min = s.match(/(\d+(?:\.\d+)?)\s*(min|minute|minutes|मिनिट|मिनट)\b/)
  if (min) { plan.targetDuration = parseFloat(min[1]) * 60; applied.push(`${min[1]} min long`) }

  // motion / fit
  if (has(/ken ?burns|zoom effect|motion|movement|pan/i, s)) { plan.kenBurns = 'on'; applied.push('Ken Burns motion') }
  if (has(/no (zoom|motion)|static|still/i, s)) { plan.kenBurns = 'off'; applied.push('No motion') }
  if (has(/fill|full ?screen|crop to fit/i, s)) { plan.fit = 'cover'; applied.push('Fill frame') }
  if (has(/whole photo|full photo|don'?t crop|no crop|blur background|blurred background/i, s)) { plan.fit = 'blur'; applied.push('Whole photo on blurred background') }

  // order
  if (has(/reverse|ulta|उलट/i, s)) { plan.order = 'reverse'; applied.push('Reverse order') }
  if (has(/shuffle|random/i, s)) { plan.order = 'shuffle'; applied.push('Shuffle') }

  // sound
  const wantsSong = has(/song|music|gaana|gana|गाणं|गाणे|गाना|bgm|background music|sangeet|संगीत|audio track|tune/i, s)
  if (has(/mute|no sound|without sound|remove (the )?(original )?(sound|audio)|aawaz band|awaz band|आवाज बंद|आवाज काढ|sound off|silent/i, s)) {
    plan.originalAudioVolume = 0
    applied.push('Original sound muted')
  }
  if (has(/no (song|music)|remove (the )?(song|music)|song kadh|गाणं काढ/i, s)) { plan.music = 'none'; applied.push('Music removed') }
  else if (wantsSong || makeReel) {
    const mood =
      (has(/romantic|love|prem|प्रेम|pyar/i, s) && 'romantic') ||
      (has(/festive|dhol|ढोल|diwali|ganpati|festival/i, s) && 'festive') ||
      (has(/cinematic|epic/i, s) && 'cinematic') ||
      (has(/sad|emotional|bhavuk/i, s) && 'sad') ||
      (has(/lofi|lo-fi|chill/i, s) && 'lofi') ||
      (has(/calm|peaceful|shant|शांत|soft/i, s) && 'calm') ||
      (has(/party|upbeat|dance|happy|energetic|fast/i, s) && 'upbeat') ||
      occ?.music ||
      'upbeat'
    plan.music = mood
    applied.push(`${mood[0].toUpperCase() + mood.slice(1)} music`)
  }
  const vol = s.match(/(song|music|gaana|गाणं|गाना)[^\d]{0,20}(\d{1,3})\s*%?/)
  if (vol) { plan.musicVolume = Math.min(100, +vol[2]); applied.push(`Music ${plan.musicVolume}%`) }
  else if (has(/(song|music).{0,15}(low|kami|कमी|kam|soft|halka)|(low|kami|soft).{0,10}(song|music)/i, s)) { plan.musicVolume = 35; applied.push('Music softer') }
  else if (has(/(song|music).{0,15}(loud|jast|जास्त|zyada|high)/i, s)) { plan.musicVolume = 100; applied.push('Music louder') }

  // text in quotes
  const q = text.match(/["“'‘«](.+?)["”'’»]/)
  if (q) {
    const whole = has(/whole|full|purn|पूर्ण|throughout|sagal|सगळ/i, s)
    const end = has(/\bend\b|shevat|शेवट|last|ant\b/i, s)
    const start = end ? Math.max(0, total - 3.5) : 0
    plan.addTexts.push({
      text: q[1],
      start,
      end: whole ? Math.max(total, 3) : start + 3.5,
      position: has(/top|upar|वर|ऊपर/i, s) ? 'top' : has(/bottom|khali|खाली|नीचे/i, s) ? 'bottom' : 'center',
      animation: has(/credits?|bottom to top|khalun var|खालून वर|niche se upar/i, s) ? 'credits' : has(/scroll|ticker|moving|left to right|right to left|sarak|सरक/i, s) ? 'scroll' : has(/typewriter|typing/i, s) ? 'typewriter' : has(/slide/i, s) ? 'slide' : 'pop',
      size: 'large',
      color: '#ffffff',
      font: /[ऀ-ॿ]/.test(q[1]) ? 'Noto Sans Devanagari' : 'Playfair Display',
    })
    applied.push(`Text “${q[1]}”`)
  }
  if (has(/remove (all )?text|text kadh|टेक्स्ट काढ/i, s)) { plan.removeAllTexts = true; applied.push('Text removed') }

  // "make a reel" with nothing else specified → complete professional setup
  if (makeReel) {
    if (plan.transition === 'keep') { plan.transition = 'fade'; plan.transitionDuration = 0.6; applied.push('Smooth transitions') }
    if (plan.kenBurns === 'keep') { plan.kenBurns = 'on'; applied.push('Ken Burns motion') }
    if (plan.fit === 'keep' && plan.aspect === '9:16') plan.fit = 'blur'
    if (plan.imageDuration < 0 && plan.targetDuration < 0) plan.imageDuration = plan.music === 'upbeat' || plan.music === 'festive' ? 1.8 : 2.8
    if (plan.filter === 'keep') { plan.filter = 'Auto Pro'; applied.push('Auto Pro look') }
  }

  return { plan, applied: [...new Set(applied)] }
}
