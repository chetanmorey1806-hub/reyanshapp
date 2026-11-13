import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icons.jsx'
import { DEFAULT_ADJUSTMENTS, SLIDERS, centerCrop, resetTone } from '../utils/adjustments.js'
import { allPresets, applyPreset, lookOf } from '../utils/presets.js'
import { FONTS, HSL_BANDS, curveLut, renderToCanvas } from '../utils/renderer.js'
import { deleteMyPreset, getBrand, saveMyPreset, setBrand } from '../utils/brand.js'

const byKey = Object.fromEntries(SLIDERS.map((s) => [s.key, s]))

// ---- shared slider ---------------------------------------------------------------
export function Slider({ def, value, onStart, onChange, onReset, label }) {
  const changed = onReset && value !== DEFAULT_ADJUSTMENTS[def.key]
  const pct = ((value - def.min) / (def.max - def.min)) * 100
  const zero = def.min < 0 ? ((0 - def.min) / (def.max - def.min)) * 100 : 0
  return (
    <div className={`slider ${changed ? 'changed' : ''}`}>
      <div className="slider-head">
        <span>{label ?? def.label}</span>
        <span className="slider-value">
          {value > 0 && def.min < 0 ? '+' : ''}
          {Math.round(value * 10) / 10}
          {def.unit}
          {changed && (
            <button className="reset-mini" title="Reset" onClick={onReset}>
              ↺
            </button>
          )}
        </span>
      </div>
      <input
        type="range"
        min={def.min}
        max={def.max}
        step={def.step ?? 1}
        value={value}
        style={{ '--pct': `${pct}%`, '--zero': `${zero}%` }}
        className={def.min < 0 ? 'bipolar' : ''}
        onPointerDown={onStart}
        onDoubleClick={onReset}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label ?? def.label}
      />
    </div>
  )
}

function PanelHead({ title, children }) {
  return (
    <div className="panel-head">
      <h3>{title}</h3>
      <div className="panel-head-actions">{children}</div>
    </div>
  )
}

// ---- Adjust ------------------------------------------------------------------------
export function AdjustPanel({ adj, onStart, onLive, onCommit, onAuto }) {
  const [open, setOpen] = useState({ Light: true, Colour: false, Effects: false, HSL: false, Curve: false })
  return (
    <div className="panel">
      <PanelHead title="Adjust">
        <button className="btn btn-ghost btn-sm" onClick={onAuto}>
          <Icon name="wand" size={15} /> Auto
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => onCommit(resetTone(adj))}>
          Reset
        </button>
      </PanelHead>
      <div className="panel-body">
        {['Light', 'Colour', 'Effects'].map((g) => (
          <section key={g} className={`group ${open[g] ? 'open' : ''}`}>
            <button className="group-head" onClick={() => setOpen((o) => ({ ...o, [g]: !o[g] }))}>
              <Icon name={g === 'Light' ? 'sun' : g === 'Colour' ? 'drop' : 'aperture'} size={16} />
              {g}
              <Icon name="right" size={14} className="chev" />
            </button>
            {open[g] && (
              <div className="group-body">
                {SLIDERS.filter((s) => s.group === g).map((s) => (
                  <Slider
                    key={s.key}
                    def={s}
                    value={adj[s.key]}
                    onStart={onStart}
                    onChange={(v) => onLive({ ...adj, [s.key]: v })}
                    onReset={() => onCommit({ ...adj, [s.key]: DEFAULT_ADJUSTMENTS[s.key] })}
                  />
                ))}
              </div>
            )}
          </section>
        ))}
        <section className={`group ${open.HSL ? 'open' : ''}`}>
          <button className="group-head" onClick={() => setOpen((o) => ({ ...o, HSL: !o.HSL }))}>
            <span className="hsl-dot" /> Colour mixer (HSL)
            <Icon name="right" size={14} className="chev" />
          </button>
          {open.HSL && <HslMixer adj={adj} onStart={onStart} onLive={onLive} onCommit={onCommit} />}
        </section>
        <section className={`group ${open.Curve ? 'open' : ''}`}>
          <button className="group-head" onClick={() => setOpen((o) => ({ ...o, Curve: !o.Curve }))}>
            <Icon name="speed" size={16} /> Tone curve
            <Icon name="right" size={14} className="chev" />
          </button>
          {open.Curve && <CurveEditor adj={adj} onStart={onStart} onLive={onLive} onCommit={onCommit} />}
        </section>
      </div>
    </div>
  )
}

// ---- HSL colour mixer ----------------------------------------------------------------
function HslMixer({ adj, onStart, onLive, onCommit }) {
  const [band, setBand] = useState('orange')
  const cur = adj.hsl?.[band] || {}
  const set = (k, v, live = true) => {
    const next = { ...adj, hsl: { ...adj.hsl, [band]: { ...cur, [k]: v } } }
    live ? onLive(next) : onCommit(next)
  }
  const defs = [
    { key: 'h', label: 'Hue', min: -40, max: 40, unit: '°' },
    { key: 's', label: 'Saturation', min: -100, max: 100 },
    { key: 'l', label: 'Luminance', min: -100, max: 100 },
  ]
  return (
    <div className="group-body">
      <div className="band-row">
        {HSL_BANDS.map((b) => {
          const v = adj.hsl?.[b.key]
          const changed = v && (v.h || v.s || v.l)
          return (
            <button key={b.key} className={`band ${band === b.key ? 'active' : ''} ${changed ? 'changed' : ''}`} style={{ '--c': b.color }} onClick={() => setBand(b.key)} aria-label={b.label} title={b.label} />
          )
        })}
      </div>
      <p className="muted small hint">
        {HSL_BANDS.find((b) => b.key === band).label}: change only this colour. Orange = skin tones, blue = sky, green = trees.
      </p>
      {defs.map((d) => (
        <Slider
          key={d.key}
          def={{ ...d, key: `hsl-${d.key}` }}
          label={d.label}
          value={cur[d.key] || 0}
          onStart={onStart}
          onChange={(v) => set(d.key, v)}
          onReset={() => set(d.key, 0, false)}
        />
      ))}
      <button className="chip-btn wide" onClick={() => onCommit({ ...adj, hsl: {} })}>
        Reset colour mixer
      </button>
    </div>
  )
}

// ---- tone curve editor -----------------------------------------------------------------
const CURVE_PRESETS = {
  Linear: [[0, 0], [255, 255]],
  Contrast: [[0, 0], [64, 46], [192, 210], [255, 255]],
  'Matte fade': [[0, 34], [70, 72], [190, 200], [255, 240]],
  Brighten: [[0, 0], [110, 145], [255, 255]],
  Darken: [[0, 0], [140, 108], [255, 255]],
}
const CHANNELS = [
  { key: 'rgb', label: 'RGB', color: '#ededf0' },
  { key: 'r', label: 'R', color: '#ff6b6b' },
  { key: 'g', label: 'G', color: '#5fd69b' },
  { key: 'b', label: 'B', color: '#6fb7ff' },
]
const LINEAR = [[0, 0], [255, 255]]

function CurveEditor({ adj, onStart, onLive, onCommit }) {
  const [ch, setCh] = useState('rgb')
  const svgRef = useRef(null)
  const drag = useRef(null)
  const curve = adj.curve || {}
  const pts = curve[ch] || LINEAR
  const color = CHANNELS.find((c) => c.key === ch).color

  const setPts = (next, live) => {
    const c = { rgb: LINEAR, r: LINEAR, g: LINEAR, b: LINEAR, ...curve, [ch]: next }
    live ? onLive({ ...adj, curve: c }) : onCommit({ ...adj, curve: c })
  }
  const toCurve = (e) => {
    const r = svgRef.current.getBoundingClientRect()
    return [Math.round(Math.min(255, Math.max(0, ((e.clientX - r.left) / r.width) * 255))), Math.round(Math.min(255, Math.max(0, (1 - (e.clientY - r.top) / r.height) * 255)))]
  }
  const lut = useMemo(() => curveLut(pts), [pts])
  const path = useMemo(() => Array.from({ length: 33 }, (_, i) => `${i ? 'L' : 'M'}${(i * 8 * 100) / 256} ${100 - (lut[Math.min(255, i * 8)] * 100) / 255}`).join(' '), [lut])

  function down(e) {
    e.preventDefault()
    const p = toCurve(e)
    let idx = pts.findIndex(([x, y]) => Math.abs(x - p[0]) < 14 && Math.abs(y - p[1]) < 14)
    let next = pts
    if (idx < 0) {
      next = [...pts, p].sort((a, b) => a[0] - b[0])
      idx = next.findIndex((q) => q === p)
    }
    onStart()
    drag.current = idx
    svgRef.current.setPointerCapture(e.pointerId)
    setPts(next, true)
  }
  function move(e) {
    if (drag.current == null) return
    const p = toCurve(e)
    const next = pts.map((q) => [...q])
    const i = drag.current
    const lo = i === 0 ? 0 : next[i - 1][0] + 4
    const hi = i === next.length - 1 ? 255 : next[i + 1][0] - 4
    next[i] = [i === 0 ? 0 : i === next.length - 1 ? 255 : Math.min(hi, Math.max(lo, p[0])), p[1]]
    setPts(next, true)
  }
  function up() {
    drag.current = null
  }

  return (
    <div className="group-body">
      <div className="chip-wrap">
        {CHANNELS.map((c) => (
          <button key={c.key} className={`aspect-btn ${ch === c.key ? 'active' : ''}`} style={{ color: ch === c.key ? c.color : undefined }} onClick={() => setCh(c.key)}>
            {c.label}
          </button>
        ))}
      </div>
      <svg ref={svgRef} className="curve" viewBox="0 0 100 100" preserveAspectRatio="none" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {[25, 50, 75].map((v) => (
          <g key={v}>
            <line x1={v} y1="0" x2={v} y2="100" />
            <line x1="0" y1={v} x2="100" y2={v} />
          </g>
        ))}
        <line className="diag" x1="0" y1="100" x2="100" y2="0" />
        <path d={path} style={{ stroke: color }} />
        {pts.map(([x, y], i) => (
          <circle
            key={i}
            cx={(x * 100) / 255}
            cy={100 - (y * 100) / 255}
            r="2.6"
            style={{ fill: color }}
            onDoubleClick={(e) => {
              e.stopPropagation()
              if (i > 0 && i < pts.length - 1) setPts(pts.filter((_, j) => j !== i), false)
            }}
          />
        ))}
      </svg>
      <p className="muted small hint">Tap to add a point, drag to shape, double-tap a point to remove it.</p>
      <div className="chip-wrap">
        {Object.entries(CURVE_PRESETS).map(([n, v]) => (
          <button key={n} className="aspect-btn" onClick={() => setPts(v, false)}>
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---- Filters -----------------------------------------------------------------------
export function FiltersPanel({ base, adj, onStart, onLive, onCommit, notify }) {
  const [active, setActive] = useState(null)
  const [amount, setAmount] = useState(100)
  const [list, setList] = useState(allPresets)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const PRESETS = list

  // small live thumbnails of every look on this photo
  const thumbs = useMemo(() => {
    const plain = { ...adj, texts: [], frame: 0 }
    const c = document.createElement('canvas')
    return PRESETS.map((p) => {
      renderToCanvas(c, base, applyPreset(plain, p), 120)
      return c.toDataURL('image/jpeg', 0.8)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, adj.rotate, adj.flipH, adj.flipV, adj.crop, adj.straighten, list])

  function save() {
    const n = name.trim() || `My look ${list.filter((p) => p.mine).length + 1}`
    saveMyPreset(n, lookOf(adj))
    setList(allPresets())
    setNaming(false)
    setName('')
    notify?.(`Preset “${n}” saved`, 'success')
  }

  return (
    <div className="panel">
      <PanelHead title="Filters & looks">
        <button className="btn btn-ghost btn-sm" onClick={() => setNaming((v) => !v)}>
          <Icon name="plus" size={15} /> Save my look
        </button>
      </PanelHead>
      <div className="panel-body">
        {naming && (
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Preset name, e.g. My wedding look" />
            <button className="send-btn" aria-label="Save">
              <Icon name="check" size={16} />
            </button>
          </form>
        )}
        <div className="preset-grid">
          {PRESETS.map((p, i) => (
            <button
              key={p.name}
              className={`preset ${active === p.name ? 'active' : ''}`}
              style={{ '--d': `${i * 25}ms` }}
              onClick={() => {
                setActive(p.name)
                setAmount(100)
                onCommit(applyPreset(adj, p, 100))
              }}
            >
              <img src={thumbs[i]} alt="" />
              <span>
                {p.mine && '★ '}
                {p.name}
              </span>
              {p.mine && (
                <i
                  className="preset-del"
                  role="button"
                  aria-label={`Delete ${p.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteMyPreset(p.name)
                    setList(allPresets())
                  }}
                >
                  ×
                </i>
              )}
            </button>
          ))}
        </div>
        {active && active !== 'Original' && (
          <div className="sticky-bottom">
            <Slider
              def={{ key: 'amount', min: 0, max: 150, unit: '%' }}
              label={`${active} strength`}
              value={amount}
              onStart={onStart}
              onChange={(v) => {
                setAmount(v)
                onLive(applyPreset(adj, active, v))
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ---- Crop & rotate ---------------------------------------------------------------------
export const ASPECTS = ['Free', 'Original', '1:1', '4:5', '9:16', '16:9', '3:2', '2:3', '4:3']

export function CropPanel({ adj, frame, draft, setDraft, aspect, setAspect, onStart, onLive, onCommit, onApply }) {
  return (
    <div className="panel">
      <PanelHead title="Crop & rotate">
        <button className="btn btn-ghost btn-sm" onClick={() => { setAspect('Free'); setDraft({ x: 0, y: 0, w: 1, h: 1 }) }}>
          Reset
        </button>
      </PanelHead>
      <div className="panel-body">
        <p className="label">Aspect ratio</p>
        <div className="aspect-grid">
          {ASPECTS.map((a) => (
            <button
              key={a}
              className={`aspect-btn ${aspect === a ? 'active' : ''}`}
              onClick={() => {
                setAspect(a)
                if (a === 'Free' || a === 'Original') setDraft({ x: 0, y: 0, w: 1, h: 1 })
                else setDraft(centerCrop(a, frame.fw, frame.fh) ?? { x: 0, y: 0, w: 1, h: 1 })
              }}
            >
              {a !== 'Free' && a !== 'Original' && <i style={{ aspectRatio: a.replace(':', '/') }} />}
              {a}
            </button>
          ))}
        </div>
        <Slider
          def={byKey.straighten}
          value={adj.straighten}
          onStart={onStart}
          onChange={(v) => onLive({ ...adj, straighten: v })}
          onReset={() => onCommit({ ...adj, straighten: 0 })}
        />
        <div className="geo-row">
          <button className="chip-btn" onClick={() => onCommit({ ...adj, rotate: (adj.rotate + 270) % 360, crop: null })}>
            <Icon name="rotateL" size={16} /> Left
          </button>
          <button className="chip-btn" onClick={() => onCommit({ ...adj, rotate: (adj.rotate + 90) % 360, crop: null })}>
            <Icon name="rotateR" size={16} /> Right
          </button>
          <button className="chip-btn" onClick={() => onCommit({ ...adj, flipH: !adj.flipH })}>
            <Icon name="flipH" size={16} /> Mirror
          </button>
          <button className="chip-btn" onClick={() => onCommit({ ...adj, flipV: !adj.flipV })}>
            <Icon name="flipV" size={16} /> Flip
          </button>
        </div>
        <p className="muted small hint">Drag the box on the photo to move it, drag the corners to resize.</p>
        <button className="btn btn-primary wide" onClick={() => onApply(draft)}>
          <Icon name="check" size={16} /> Apply crop
        </button>
      </div>
    </div>
  )
}

// ---- Text & stickers ---------------------------------------------------------------------
const STICKERS = ['❤️', '✨', '🔥', '😍', '🎉', '💍', '🌸', '⭐', '📸', '🙏', '🪔', '🎂', '👑', '💐', '😎', '🌙', '🦋', '🌈', '🥂', '💫']
const SWATCHES = ['#ffffff', '#111111', '#f3d39b', '#e9a27c', '#ff5d73', '#ffd23f', '#5fd69b', '#6fb7ff', '#a48bff']
const TEXT_STYLES = [
  { name: 'Classic', font: 'Playfair Display', weight: 700, italic: false, shadow: true },
  { name: 'Bold', font: 'Bebas Neue', weight: 400, italic: false, shadow: true, spacing: 4 },
  { name: 'Script', font: 'Great Vibes', weight: 400, italic: false, shadow: true },
  { name: 'Modern', font: 'Montserrat', weight: 600, italic: false, shadow: false, bg: 'rgba(0,0,0,0.55)' },
  { name: 'Elegant', font: 'Instrument Serif', weight: 400, italic: true, shadow: true },
  { name: 'मराठी', font: 'Noto Sans Devanagari', weight: 600, italic: false, shadow: true },
]

let tid = 0
const newId = () => `t${Date.now()}${tid++}`

export function TextPanel({ adj, selected, setSelected, onStart, onLive, onCommit }) {
  const texts = adj.texts || []
  const cur = texts.find((t) => t.id === selected)
  const update = (patch, live = false) => {
    const next = { ...adj, texts: texts.map((t) => (t.id === selected ? { ...t, ...patch } : t)) }
    live ? onLive(next) : onCommit(next)
  }
  const add = (layer) => {
    const t = { x: 0.5, y: 0.5, size: 0.08, color: '#ffffff', font: 'Playfair Display', weight: 700, italic: false, shadow: true, opacity: 100, ...layer, id: newId() }
    onCommit({ ...adj, texts: [...texts, t] })
    setSelected(t.id)
  }

  // make sure web fonts are ready before they are drawn on the canvas
  useEffect(() => {
    if (cur?.font) document.fonts?.load(`${cur.weight || 700} 40px "${cur.font}"`)
  }, [cur?.font, cur?.weight])

  return (
    <div className="panel">
      <PanelHead title="Text & stickers">
        <button className="btn btn-primary btn-sm" onClick={() => add({ text: 'Your text' })}>
          <Icon name="plus" size={15} /> Text
        </button>
      </PanelHead>
      <div className="panel-body">
        {texts.length > 0 && (
          <div className="layer-list">
            {texts.map((t) => (
              <button key={t.id} className={`layer ${t.id === selected ? 'active' : ''}`} onClick={() => setSelected(t.id)}>
                <Icon name="type" size={14} /> <span>{t.text || '(empty)'}</span>
              </button>
            ))}
          </div>
        )}

        {cur ? (
          <div className="text-editor">
            <textarea
              value={cur.text}
              rows={2}
              onFocus={onStart}
              onChange={(e) => update({ text: e.target.value }, true)}
              placeholder="Type here… (English, मराठी, हिंदी)"
            />
            <div className="style-row">
              {TEXT_STYLES.map((s) => (
                <button
                  key={s.name}
                  className={`style-chip ${cur.font === s.font ? 'active' : ''}`}
                  style={{ fontFamily: `"${s.font}"`, fontStyle: s.italic ? 'italic' : 'normal' }}
                  onClick={() => update({ bg: '', spacing: 0, ...s, name: undefined })}
                >
                  {s.name}
                </button>
              ))}
            </div>
            <label className="field">
              <span>Font</span>
              <select value={cur.font} onChange={(e) => update({ font: e.target.value })}>
                {FONTS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <Slider def={{ key: 'size', min: 2, max: 40, step: 0.5 }} label="Size" value={Math.round(cur.size * 1000) / 10} onStart={onStart} onChange={(v) => update({ size: v / 100 }, true)} />
            <div className="swatches">
              {SWATCHES.map((c) => (
                <button key={c} className={`swatch ${cur.color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => update({ color: c })} aria-label={c} />
              ))}
              <input type="color" value={/^#[0-9a-f]{6}$/i.test(cur.color) ? cur.color : '#ffffff'} onChange={(e) => update({ color: e.target.value }, true)} onPointerDown={onStart} aria-label="Custom colour" />
            </div>
            <div className="toggle-row">
              <button className={`toggle ${cur.weight >= 600 ? 'on' : ''}`} onClick={() => update({ weight: cur.weight >= 600 ? 400 : 700 })} aria-label="Bold">
                <Icon name="bold" size={15} />
              </button>
              <button className={`toggle ${cur.italic ? 'on' : ''}`} onClick={() => update({ italic: !cur.italic })} aria-label="Italic">
                <Icon name="italic" size={15} />
              </button>
              <button className={`toggle ${cur.shadow ? 'on' : ''}`} onClick={() => update({ shadow: !cur.shadow })}>
                Shadow
              </button>
              <button className={`toggle ${cur.stroke ? 'on' : ''}`} onClick={() => update({ stroke: !cur.stroke })}>
                Outline
              </button>
              <button className={`toggle ${cur.bg ? 'on' : ''}`} onClick={() => update({ bg: cur.bg ? '' : 'rgba(0,0,0,0.55)' })}>
                Box
              </button>
            </div>
            <Slider def={{ key: 'opacity', min: 0, max: 100, unit: '%' }} label="Opacity" value={cur.opacity ?? 100} onStart={onStart} onChange={(v) => update({ opacity: v }, true)} />
            <div className="pos-row">
              {[
                ['Top', 0.12],
                ['Middle', 0.5],
                ['Bottom', 0.86],
              ].map(([n, y]) => (
                <button key={n} className="chip-btn" onClick={() => update({ y, x: 0.5 })}>
                  {n}
                </button>
              ))}
            </div>
            <div className="pos-row">
              <button className="chip-btn" onClick={() => add({ ...cur, id: undefined, y: Math.min(0.95, cur.y + 0.08) })}>
                <Icon name="copy" size={15} /> Duplicate
              </button>
              <button
                className="chip-btn danger"
                onClick={() => {
                  onCommit({ ...adj, texts: texts.filter((t) => t.id !== selected) })
                  setSelected(null)
                }}
              >
                <Icon name="trash" size={15} /> Delete
              </button>
            </div>
            <p className="muted small hint">Tip: drag the text on the photo to move it.</p>
          </div>
        ) : (
          <p className="muted small hint">Add a title, a name or a date. Or tap a sticker below. You can also ask the AI: “text "Happy Birthday" at top”.</p>
        )}

        <p className="label">Stickers</p>
        <div className="sticker-grid">
          {STICKERS.map((s) => (
            <button key={s} className="sticker" onClick={() => add({ text: s, size: 0.14, shadow: false, font: 'Inter' })}>
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---- Frame / border ------------------------------------------------------------------
const FRAME_COLORS = ['#ffffff', '#000000', '#f5efe4', '#e8d3a5', '#2b2b30', '#f4c2c2', '#c9d6c3']

export function FramePanel({ adj, onStart, onLive, onCommit }) {
  const [brand, setB] = useState(getBrand)
  const logoRef = useRef(null)
  const updateBrand = (patch) => {
    setBrand(patch)
    setB(getBrand())
    if (!adj.watermark) onCommit({ ...adj, watermark: true })
  }
  return (
    <div className="panel">
      <PanelHead title="Frame & border" />
      <div className="panel-body">
        <Slider
          def={byKey.frame}
          value={adj.frame}
          onStart={onStart}
          onChange={(v) => onLive({ ...adj, frame: v })}
          onReset={() => onCommit({ ...adj, frame: 0 })}
        />
        <p className="label">Colour</p>
        <div className="swatches">
          {FRAME_COLORS.map((c) => (
            <button key={c} className={`swatch ${adj.frameColor === c ? 'active' : ''}`} style={{ background: c }} onClick={() => onCommit({ ...adj, frameColor: c, frame: adj.frame || 4 })} aria-label={c} />
          ))}
          <input type="color" value={adj.frameColor} onPointerDown={onStart} onChange={(e) => onLive({ ...adj, frameColor: e.target.value })} aria-label="Custom colour" />
        </div>
        <div className="pos-row">
          {[
            ['Thin', 2],
            ['Gallery', 6],
            ['Wide', 12],
          ].map(([n, v]) => (
            <button key={n} className="chip-btn" onClick={() => onCommit({ ...adj, frame: v })}>
              {n}
            </button>
          ))}
        </div>

        <div className="divider-line" />
        <label className="switch-row">
          <span>
            <b>Watermark</b> <span className="muted small">(your name / logo)</span>
          </span>
          <input type="checkbox" checked={!!adj.watermark} onChange={(e) => onCommit({ ...adj, watermark: e.target.checked })} />
        </label>
        <input className="text-input" value={brand.text} onChange={(e) => updateBrand({ text: e.target.value })} placeholder="Studio name, e.g. Stories by Reyansh" />
        <div className="pos-row">
          <button className="chip-btn" onClick={() => logoRef.current?.click()}>
            <Icon name="upload" size={15} /> {brand.logo ? 'Change logo' : 'Add logo'}
          </button>
          {brand.logo && (
            <button className="chip-btn danger" onClick={() => updateBrand({ logo: '' })}>
              <Icon name="trash" size={15} /> Remove logo
            </button>
          )}
        </div>
        <input
          ref={logoRef}
          type="file"
          accept="image/png,image/svg+xml,image/webp,image/jpeg"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            const r = new FileReader()
            r.onload = () => updateBrand({ logo: r.result })
            r.readAsDataURL(f)
          }}
        />
        <p className="label">Position</p>
        <div className="corner-grid">
          {[
            ['tl', 'Top left'],
            ['tc', 'Top'],
            ['tr', 'Top right'],
            ['bl', 'Bottom left'],
            ['bc', 'Bottom'],
            ['br', 'Bottom right'],
          ].map(([v, l]) => (
            <button key={v} className={`aspect-btn ${brand.position === v ? 'active' : ''}`} onClick={() => updateBrand({ position: v })}>
              {l}
            </button>
          ))}
        </div>
        <Slider def={{ key: 'wms', min: 2, max: 10, step: 0.5 }} label="Size" value={brand.size} onChange={(v) => updateBrand({ size: v })} />
        <Slider def={{ key: 'wmo', min: 10, max: 100, unit: '%' }} label="Opacity" value={brand.opacity} onChange={(v) => updateBrand({ opacity: v })} />
        <p className="muted small hint">Saved on this device and also used for videos & reels.</p>
      </div>
    </div>
  )
}
