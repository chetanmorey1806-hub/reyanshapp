// Built-in background music, generated in the browser by mood (royalty-free:
// nothing is downloaded). Rendered with an OfflineAudioContext and returned as
// a WAV blob URL, so it plays and exports exactly like an uploaded song.

export const MOODS = [
  { id: 'romantic', label: 'Romantic', emoji: '💕', hint: 'Wedding, couple, love' },
  { id: 'upbeat', label: 'Upbeat', emoji: '🎉', hint: 'Party, travel, fun' },
  { id: 'cinematic', label: 'Cinematic', emoji: '🎬', hint: 'Epic, trailer, drama' },
  { id: 'festive', label: 'Festive', emoji: '🪔', hint: 'Diwali, Ganpati, dhol' },
  { id: 'calm', label: 'Calm', emoji: '🌿', hint: 'Nature, peaceful' },
  { id: 'lofi', label: 'Lo-fi', emoji: '🎧', hint: 'Chill, aesthetic' },
  { id: 'sad', label: 'Emotional', emoji: '🌧️', hint: 'Memories, tribute' },
]

const STYLES = {
  romantic: { bpm: 72, key: 62, chords: [[0, 4, 7, 11], [9, 12, 16, 19], [5, 9, 12, 16], [7, 11, 14, 17]], pad: 1, arp: 'piano8', bass: 'long', drums: null },
  upbeat: { bpm: 118, key: 64, chords: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]], pad: 0.5, arp: 'pluck16', bass: 'eighths', drums: 'four' },
  cinematic: { bpm: 64, key: 57, chords: [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]], pad: 1.4, arp: 'bell4', bass: 'long', drums: 'epic' },
  festive: { bpm: 108, key: 62, chords: [[0, 4, 7], [10, 14, 17], [5, 9, 12], [0, 4, 7]], pad: 0.5, arp: 'melody', bass: 'eighths', drums: 'dhol' },
  calm: { bpm: 76, key: 65, chords: [[0, 4, 7, 11], [5, 9, 12, 16], [4, 7, 11, 14], [9, 12, 16, 19]], pad: 1.1, arp: 'bell4', bass: 'long', drums: null },
  lofi: { bpm: 82, key: 63, chords: [[2, 5, 9, 12], [7, 11, 14, 17], [0, 4, 7, 11], [9, 12, 16, 19]], pad: 0.8, arp: 'piano4', bass: 'long', drums: 'boombap', vinyl: true },
  sad: { bpm: 62, key: 57, chords: [[0, 3, 7], [5, 8, 12], [8, 12, 15], [7, 11, 14]], pad: 0.9, arp: 'piano8', bass: 'long', drums: null },
}

const SR = 32000
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12)

// small deterministic random so the same mood sounds the same
function rng(seed) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

export async function generateMusic(mood, seconds) {
  const st = STYLES[mood] ?? STYLES.upbeat
  const beat = 60 / st.bpm
  const bar = beat * 4
  const dur = Math.min(240, Math.max(20, seconds))
  const bars = Math.ceil(dur / bar) + 1
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * dur), SR)

  const master = ctx.createGain()
  master.gain.setValueAtTime(0, 0)
  master.gain.linearRampToValueAtTime(0.9, 1.2)
  master.gain.setValueAtTime(0.9, Math.max(1.3, dur - 2.5))
  master.gain.linearRampToValueAtTime(0, dur)
  const comp = ctx.createDynamicsCompressor()
  master.connect(comp).connect(ctx.destination)

  // shared noise buffer for drums
  const noise = ctx.createBuffer(1, SR, SR)
  const nd = noise.getChannelData(0)
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1

  const env = (g, t, a, peak, d) => {
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(peak, t + a)
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d)
  }

  const pad = (notes, t, len) => {
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 900 + st.pad * 700
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.05 * st.pad, t + 0.5)
    g.gain.setValueAtTime(0.05 * st.pad, t + len - 0.2)
    g.gain.linearRampToValueAtTime(0.0001, t + len + 0.6)
    lp.connect(g).connect(master)
    for (const n of notes) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = hz(n)
        o.detune.value = det
        o.connect(lp)
        o.start(t)
        o.stop(t + len + 0.7)
      }
    }
  }

  const tone = (m, t, len, vol, type = 'triangle', cutoff = 3000) => {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = hz(m)
    const o2 = ctx.createOscillator()
    o2.type = 'sine'
    o2.frequency.value = hz(m + 12)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = cutoff
    const g = ctx.createGain()
    env(g, t, 0.005, vol, len)
    const g2 = ctx.createGain()
    g2.gain.value = 0.3
    o.connect(lp)
    o2.connect(g2).connect(lp)
    lp.connect(g).connect(master)
    o.start(t)
    o2.start(t)
    o.stop(t + len + 0.1)
    o2.stop(t + len + 0.1)
  }

  const bassNote = (m, t, len, vol = 0.22) => {
    const o = ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.value = hz(m)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(vol, t + 0.02)
    g.gain.setValueAtTime(vol, t + Math.max(0.03, len - 0.08))
    g.gain.linearRampToValueAtTime(0.0001, t + len)
    o.connect(g).connect(master)
    o.start(t)
    o.stop(t + len + 0.05)
  }

  const kick = (t, vol = 0.9) => {
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(140, t)
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12)
    const g = ctx.createGain()
    env(g, t, 0.002, vol, 0.38)
    o.connect(g).connect(master)
    o.start(t)
    o.stop(t + 0.45)
  }

  const hit = (t, type, freq, vol, len) => {
    const s = ctx.createBufferSource()
    s.buffer = noise
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    const g = ctx.createGain()
    env(g, t, 0.001, vol, len)
    s.connect(f).connect(g).connect(master)
    s.start(t, Math.random() * 0.5)
    s.stop(t + len + 0.05)
  }

  const tom = (t, f, vol = 0.7) => {
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(f * 1.6, t)
    o.frequency.exponentialRampToValueAtTime(f, t + 0.08)
    const g = ctx.createGain()
    env(g, t, 0.002, vol, 0.32)
    o.connect(g).connect(master)
    o.start(t)
    o.stop(t + 0.4)
  }

  const rand = rng(st.bpm * 31 + st.key)
  const scale = [0, 2, 4, 7, 9, 12, 14, 16]

  for (let b = 0; b < bars; b++) {
    const t0 = b * bar
    if (t0 > dur) break
    const chord = st.chords[b % st.chords.length].map((n) => n + st.key)
    pad(chord.map((n) => n - 12), t0, bar)

    // bass
    const root = chord[0] - 24
    if (st.bass === 'long') bassNote(root, t0, bar * 0.95, 0.2)
    else for (let i = 0; i < 8; i++) bassNote(root + (i === 6 ? 7 : 0), t0 + (i * beat) / 2, beat / 2 - 0.02, 0.18)

    // arpeggio / melody (enters after the first bar)
    if (b > 0 || st.arp.startsWith('bell')) {
      if (st.arp === 'piano8') for (let i = 0; i < 8; i++) tone(chord[[0, 1, 2, 1, 3 % chord.length, 2, 1, 2][i] % chord.length] , t0 + (i * beat) / 2, 1.2, 0.07, 'triangle', 2200)
      if (st.arp === 'piano4') for (let i = 0; i < 4; i++) tone(chord[(i + 1) % chord.length], t0 + i * beat + (i % 2 ? beat * 0.08 : 0), 1.4, 0.07, 'triangle', 1600)
      if (st.arp === 'pluck16') for (let i = 0; i < 16; i++) if (i % 4 !== 3) tone(chord[i % chord.length] + 12, t0 + (i * beat) / 4, 0.18, 0.05, 'square', 2600)
      if (st.arp === 'bell4') for (let i = 0; i < 4; i++) tone(chord[(i * 2) % chord.length] + 12, t0 + i * beat, 2, 0.045, 'sine', 5000)
      if (st.arp === 'melody') {
        for (let i = 0; i < 8; i++) {
          if (rand() < 0.3) continue
          tone(st.key + 12 + scale[Math.floor(rand() * scale.length)], t0 + (i * beat) / 2, 0.25, 0.06, 'sawtooth', 2400)
        }
      }
    }

    // drums
    if (st.drums === 'four' && b > 0) {
      for (let i = 0; i < 4; i++) {
        kick(t0 + i * beat)
        hit(t0 + i * beat + beat / 2, 'highpass', 8000, 0.12, 0.05)
        if (i % 2) hit(t0 + i * beat, 'bandpass', 1800, 0.45, 0.16)
      }
    }
    if (st.drums === 'boombap' && b > 0) {
      const sw = beat * 0.08
      kick(t0, 0.7)
      kick(t0 + beat * 2.5, 0.6)
      hit(t0 + beat, 'bandpass', 1500, 0.35, 0.18)
      hit(t0 + beat * 3, 'bandpass', 1500, 0.35, 0.18)
      for (let i = 0; i < 8; i++) hit(t0 + (i * beat) / 2 + (i % 2 ? sw : 0), 'highpass', 7000, 0.07, 0.04)
    }
    if (st.drums === 'dhol') {
      const pat = [0, 0.75, 1.5, 2, 2.75, 3.5]
      pat.forEach((p, i) => tom(t0 + p * beat, i % 3 === 0 ? 75 : 150, i % 3 === 0 ? 0.8 : 0.5))
      for (let i = 0; i < 8; i++) hit(t0 + (i * beat) / 2, 'highpass', 6000, 0.06, 0.03)
    }
    if (st.drums === 'epic' && b % 2 === 1) {
      tom(t0, 55, 0.9)
      tom(t0 + beat * 2.5, 70, 0.7)
      hit(t0, 'lowpass', 400, 0.3, 0.6)
    }
  }

  if (st.vinyl) {
    const s = ctx.createBufferSource()
    s.buffer = noise
    s.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 3000
    const g = ctx.createGain()
    g.gain.value = 0.012
    s.connect(f).connect(g).connect(master)
    s.start(0)
  }

  const buffer = await ctx.startRendering()
  const url = URL.createObjectURL(encodeWav(buffer))
  const info = MOODS.find((m) => m.id === mood)
  return { url, duration: buffer.duration, name: `${info?.label ?? 'Music'} (built-in)`, mood }
}

function encodeWav(buffer) {
  const ch = buffer.numberOfChannels
  const len = buffer.length * ch * 2
  const view = new DataView(new ArrayBuffer(44 + len))
  const str = (o, s) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  view.setUint32(4, 36 + len, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, ch, true)
  view.setUint32(24, buffer.sampleRate, true)
  view.setUint32(28, buffer.sampleRate * ch * 2, true)
  view.setUint16(32, ch * 2, true)
  view.setUint16(34, 16, true)
  str(36, 'data')
  view.setUint32(40, len, true)
  const data = [...Array(ch)].map((_, c) => buffer.getChannelData(c))
  let o = 44
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]))
      view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      o += 2
    }
  }
  return new Blob([view], { type: 'audio/wav' })
}
