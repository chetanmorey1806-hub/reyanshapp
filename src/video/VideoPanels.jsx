import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icons.jsx'
import { Slider } from '../components/PhotoPanels.jsx'
import { allPresets } from '../utils/presets.js'
import { getBrand } from '../utils/brand.js'
import { FONTS } from '../utils/renderer.js'
import { ASPECTS, SPEEDS, TRANSITIONS, clipLength, pickMime } from './engine.js'
import { MOODS } from './music.js'

export const fmt = (s) => {
  if (!Number.isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const r = s - m * 60
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`
}

function Head({ title, children }) {
  return (
    <div className="panel-head">
      <h3>{title}</h3>
      <div className="panel-head-actions">{children}</div>
    </div>
  )
}

function Chips({ options, value, onChange, render }) {
  return (
    <div className="chip-wrap">
      {options.map((o) => {
        const v = typeof o === 'object' ? o.value : o
        return (
          <button key={String(v)} className={`aspect-btn ${value === v ? 'active' : ''}`} onClick={() => onChange(v)}>
            {render ? render(o) : typeof o === 'object' ? o.label : o}
          </button>
        )
      })}
    </div>
  )
}

const TRANSITION_LABELS = { none: 'Cut', fade: 'Fade', slide: 'Slide', zoom: 'Zoom', wipe: 'Wipe', flash: 'Flash', blur: 'Blur' }
const FITS = [
  { value: 'cover', label: 'Fill' },
  { value: 'contain', label: 'Fit' },
  { value: 'blur', label: 'Blur bg' },
]

// ---- selected clip -----------------------------------------------------------------------
export function ClipPanel({ clip, index, count, caps, onChange, onMove, onSplit, onDuplicate, onDelete, onAiEdit, busy }) {
  const [aiText, setAiText] = useState('')
  if (!clip) {
    return (
      <div className="panel">
        <Head title="Clip" />
        <div className="panel-body">
          <p className="muted small hint">Select a clip in the timeline to trim it, change speed, volume, duration or transition.</p>
        </div>
      </div>
    )
  }
  const isVideo = clip.kind === 'video'
  return (
    <div className="panel">
      <Head title={isVideo ? 'Video clip' : 'Photo clip'}>
        <span className="muted small">{fmt(clipLength(clip))}</span>
      </Head>
      <div className="panel-body">
        <div className="clip-card">
          <img src={clip.thumb} alt="" />
          <div>
            <b>{clip.name}</b>
            <span className="muted small">
              #{index + 1} of {count} · {isVideo ? `video ${fmt(clip.srcDur)}` : 'photo'}
            </span>
          </div>
        </div>

        {isVideo ? (
          <>
            <p className="label">Trim</p>
            <Slider def={{ key: 'in', min: 0, max: clip.srcDur, step: 0.05, unit: 's' }} label={`Start · ${fmt(clip.in)}`} value={clip.in} onChange={(v) => onChange({ in: Math.min(v, clip.out - 0.2) })} />
            <Slider def={{ key: 'out', min: 0, max: clip.srcDur, step: 0.05, unit: 's' }} label={`End · ${fmt(clip.out)}`} value={clip.out} onChange={(v) => onChange({ out: Math.max(v, clip.in + 0.2) })} />
            <p className="label">Speed</p>
            <Chips options={SPEEDS} value={clip.speed} onChange={(v) => onChange({ speed: v })} render={(v) => `${v}×`} />
            <Slider def={{ key: 'volume', min: 0, max: 100, unit: '%' }} label="Clip sound" value={clip.volume} onChange={(v) => onChange({ volume: v })} />
          </>
        ) : (
          <>
            <Slider def={{ key: 'dur', min: 0.5, max: 15, step: 0.1, unit: 's' }} label="On screen for" value={clip.dur} onChange={(v) => onChange({ dur: v })} />
            <label className="switch-row">
              <span>Ken Burns motion (slow zoom & pan)</span>
              <input type="checkbox" checked={clip.kenBurns} onChange={(e) => onChange({ kenBurns: e.target.checked })} />
            </label>
            <div className="ai-inline">
              <p className="label">
                <Icon name="sparkle" size={13} /> AI edit this photo
              </p>
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (aiText.trim()) onAiEdit(aiText.trim()).then(() => setAiText(''))
                }}
              >
                <input value={aiText} onChange={(e) => setAiText(e.target.value)} placeholder={caps.generative ? 'e.g. remove the person behind' : 'e.g. make it warm and bright'} disabled={busy} />
                <button className="send-btn" disabled={busy || !aiText.trim()} aria-label="Apply">
                  {busy ? <span className="mini-spinner" /> : <Icon name="send" size={16} />}
                </button>
              </form>
            </div>
          </>
        )}

        <p className="label">Fit in frame</p>
        <Chips options={FITS} value={clip.fit} onChange={(v) => onChange({ fit: v })} />

        {index > 0 && (
          <>
            <p className="label">Transition into this clip</p>
            <Chips options={[{ value: undefined, label: 'Default' }, ...TRANSITIONS.map((t) => ({ value: t, label: TRANSITION_LABELS[t] }))]} value={clip.transition} onChange={(v) => onChange({ transition: v })} />
          </>
        )}

        <div className="pos-row four">
          <button className="chip-btn" onClick={() => onMove(-1)} disabled={index === 0}>
            <Icon name="left" size={15} /> Move
          </button>
          <button className="chip-btn" onClick={() => onMove(1)} disabled={index === count - 1}>
            Move <Icon name="right" size={15} />
          </button>
          <button className="chip-btn" onClick={onSplit}>
            <Icon name="scissors" size={15} /> Split
          </button>
          <button className="chip-btn" onClick={onDuplicate}>
            <Icon name="copy" size={15} /> Copy
          </button>
        </div>
        <button className="chip-btn danger wide" onClick={onDelete}>
          <Icon name="trash" size={15} /> Delete clip
        </button>
      </div>
    </div>
  )
}

// ---- text overlays --------------------------------------------------------------------------
const SWATCHES = ['#ffffff', '#111111', '#f3d39b', '#e9a27c', '#ff5d73', '#ffd23f', '#5fd69b', '#6fb7ff']
const ANIMS = [
  { value: 'pop', label: 'Pop' },
  { value: 'fade', label: 'Fade' },
  { value: 'slide', label: 'Slide up' },
  { value: 'typewriter', label: 'Typing' },
  { value: 'scroll', label: 'Ticker →' },
  { value: 'credits', label: 'Credits ↑' },
]
const POSITIONS = [
  { value: 'top', label: 'Top' },
  { value: 'center', label: 'Middle' },
  { value: 'bottom', label: 'Bottom' },
]

export function TextTrackPanel({ texts, selected, setSelected, total, t, onAdd, onChange, onDelete }) {
  const cur = texts.find((x) => x.id === selected)
  useEffect(() => {
    if (cur?.font) document.fonts?.load(`700 40px "${cur.font}"`)
  }, [cur?.font])
  return (
    <div className="panel">
      <Head title="Text & titles">
        <button className="btn btn-primary btn-sm" onClick={onAdd}>
          <Icon name="plus" size={15} /> Text
        </button>
      </Head>
      <div className="panel-body">
        {texts.length > 0 && (
          <div className="layer-list">
            {texts.map((x) => (
              <button key={x.id} className={`layer ${x.id === selected ? 'active' : ''}`} onClick={() => setSelected(x.id)}>
                <Icon name="type" size={14} /> <span>{x.text || '(empty)'}</span>
                <small className="muted">
                  {fmt(x.start)}–{fmt(x.end)}
                </small>
              </button>
            ))}
          </div>
        )}
        {cur ? (
          <div className="text-editor">
            <textarea value={cur.text} rows={2} onChange={(e) => onChange(cur.id, { text: e.target.value })} placeholder="Title, names, date… (English, मराठी, हिंदी)" />
            <Slider def={{ key: 's', min: 0, max: Math.max(0.1, total), step: 0.1, unit: 's' }} label={`Show from ${fmt(cur.start)}`} value={Math.min(cur.start, total)} onChange={(v) => onChange(cur.id, { start: Math.min(v, cur.end - 0.3) })} />
            <Slider def={{ key: 'e', min: 0, max: Math.max(0.1, total), step: 0.1, unit: 's' }} label={`Until ${fmt(cur.end)}`} value={Math.min(cur.end, total)} onChange={(v) => onChange(cur.id, { end: Math.max(v, cur.start + 0.3) })} />
            <button className="chip-btn wide" onClick={() => onChange(cur.id, { start: t, end: Math.min(total, t + 3) })}>
              Start at playhead ({fmt(t)})
            </button>
            <p className="label">Position</p>
            <Chips options={POSITIONS} value={cur.position} onChange={(v) => onChange(cur.id, { position: v, y: undefined })} />
            <p className="label">Animation</p>
            <Chips options={ANIMS} value={cur.anim} onChange={(v) => onChange(cur.id, { anim: v })} />
            <label className="field">
              <span>Font</span>
              <select value={cur.font} onChange={(e) => onChange(cur.id, { font: e.target.value })}>
                {FONTS.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
            <Slider def={{ key: 'size', min: 3, max: 25, step: 0.5 }} label="Size" value={Math.round(cur.size * 1000) / 10} onChange={(v) => onChange(cur.id, { size: v / 100 })} />
            <div className="swatches">
              {SWATCHES.map((c) => (
                <button key={c} className={`swatch ${cur.color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => onChange(cur.id, { color: c })} aria-label={c} />
              ))}
              <input type="color" value={/^#[0-9a-f]{6}$/i.test(cur.color) ? cur.color : '#ffffff'} onChange={(e) => onChange(cur.id, { color: e.target.value })} aria-label="Custom colour" />
            </div>
            <div className="toggle-row">
              <button className={`toggle ${cur.shadow ? 'on' : ''}`} onClick={() => onChange(cur.id, { shadow: !cur.shadow })}>
                Shadow
              </button>
              <button className={`toggle ${cur.stroke ? 'on' : ''}`} onClick={() => onChange(cur.id, { stroke: !cur.stroke })}>
                Outline
              </button>
              <button className={`toggle ${cur.bg ? 'on' : ''}`} onClick={() => onChange(cur.id, { bg: cur.bg ? '' : 'rgba(0,0,0,0.5)' })}>
                Box
              </button>
            </div>
            <button className="chip-btn danger wide" onClick={() => onDelete(cur.id)}>
              <Icon name="trash" size={15} /> Delete text
            </button>
          </div>
        ) : (
          <p className="muted small hint">Add titles, names, dates or captions with animations. Or ask the AI: “add "Rahul ❤️ Priya" at the start”.</p>
        )}
      </div>
    </div>
  )
}

// ---- music ---------------------------------------------------------------------------------
export function MusicPanel({ music, total, clipVolume, busy, onMood, onUpload, onChange, onClipVolume, onRemove }) {
  const fileRef = useRef(null)
  return (
    <div className="panel">
      <Head title="Music & sound" />
      <div className="panel-body">
        <button className="btn btn-ghost wide" onClick={() => fileRef.current?.click()} disabled={busy}>
          <Icon name="upload" size={16} /> Upload your song (MP3, M4A, WAV)
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onUpload(f)
            e.target.value = ''
          }}
        />
        <p className="label">Or AI background music by mood</p>
        <div className="mood-grid">
          {MOODS.map((m) => (
            <button key={m.id} className={`mood ${music?.mood === m.id ? 'active' : ''}`} onClick={() => onMood(m.id)} disabled={busy}>
              <span className="mood-emoji">{m.emoji}</span>
              <b>{m.label}</b>
              <small>{m.hint}</small>
            </button>
          ))}
        </div>

        {music && (
          <div className="music-card">
            <div className="music-title">
              <span className="eq">
                <i />
                <i />
                <i />
              </span>
              <b>{music.name}</b>
              <button className="icon-btn" onClick={onRemove} aria-label="Remove music">
                <Icon name="trash" size={16} />
              </button>
            </div>
            <Slider def={{ key: 'mv', min: 0, max: 100, unit: '%' }} label="Song volume" value={music.volume} onChange={(v) => onChange({ volume: v })} />
            <p className="label">
              <Icon name="scissors" size={13} /> Use part of the song
            </p>
            <Slider def={{ key: 'off', min: 0, max: Math.max(0.1, Math.floor(music.duration)), step: 0.5, unit: 's' }} label={`From ${fmt(music.offset)}`} value={music.offset} onChange={(v) => onChange({ offset: Math.min(v, (music.end ?? music.duration) - 1) })} />
            <Slider def={{ key: 'end', min: 0, max: Math.max(0.1, Math.floor(music.duration)), step: 0.5, unit: 's' }} label={`To ${fmt(music.end ?? music.duration)}`} value={music.end ?? Math.floor(music.duration)} onChange={(v) => onChange({ end: Math.max(v, music.offset + 1) })} />
            <p className="muted small hint">
              Plays {fmt((music.end ?? music.duration) - music.offset)} of the song{(music.end ?? music.duration) - music.offset < total ? ' and repeats it to fill the video' : ''}.
            </p>
          </div>
        )}
        <Slider def={{ key: 'cv', min: 0, max: 100, unit: '%' }} label="Original video sound" value={clipVolume} onChange={onClipVolume} />
        <p className="muted small hint">The song fades in and out automatically. Uploaded songs are only used on your device.</p>
      </div>
    </div>
  )
}

// ---- project style ----------------------------------------------------------------------------
export function StylePanel({ project, clips, onProject, onAllClips }) {
  const imgs = clips.filter((c) => c.kind === 'image')
  const list = allPresets()
  return (
    <div className="panel">
      <Head title="Format & style" />
      <div className="panel-body">
        <label className="switch-row">
          <span>
            <b>Watermark</b> <span className="muted small">({getBrand().text || 'logo'}, set in Photo → Frame)</span>
          </span>
          <input type="checkbox" checked={!!project.watermark} onChange={(e) => onProject({ watermark: e.target.checked })} />
        </label>
        <p className="label">Format</p>
        <div className="format-grid">
          {Object.keys(ASPECTS).map((a) => (
            <button key={a} className={`format ${project.aspect === a ? 'active' : ''}`} onClick={() => onProject({ aspect: a })}>
              <i style={{ aspectRatio: a.replace(':', '/') }} />
              <b>{a}</b>
              <small>{{ '9:16': 'Reel / Story', '16:9': 'YouTube', '1:1': 'Square', '4:5': 'Insta post' }[a]}</small>
            </button>
          ))}
        </div>

        <p className="label">Look</p>
        <div className="chip-wrap">
          {list.map((p) => (
            <button key={p.name} className={`aspect-btn ${project.filter === p.name ? 'active' : ''}`} onClick={() => onProject({ filter: p.name, filterAmount: 100 })}>
              {p.mine && '★ '}
              {p.name}
            </button>
          ))}
        </div>
        {project.filter !== 'Original' && <Slider def={{ key: 'fa', min: 0, max: 150, unit: '%' }} label="Look strength" value={project.filterAmount} onChange={(v) => onProject({ filterAmount: v })} />}

        <p className="label">Transitions</p>
        <Chips options={TRANSITIONS.map((t) => ({ value: t, label: TRANSITION_LABELS[t] }))} value={project.transition} onChange={(v) => onProject({ transition: v })} />
        {project.transition !== 'none' && <Slider def={{ key: 'td', min: 0.2, max: 2, step: 0.1, unit: 's' }} label="Transition length" value={project.transitionDuration} onChange={(v) => onProject({ transitionDuration: v })} />}

        {imgs.length > 0 && (
          <>
            <p className="label">All photos</p>
            <Slider def={{ key: 'pd', min: 0.5, max: 10, step: 0.1, unit: 's' }} label="Each photo on screen" value={imgs[0].dur} onChange={(v) => onAllClips((c) => (c.kind === 'image' ? { dur: v } : null))} />
            <label className="switch-row">
              <span>Ken Burns motion on all photos</span>
              <input type="checkbox" checked={imgs.every((c) => c.kenBurns)} onChange={(e) => onAllClips((c) => (c.kind === 'image' ? { kenBurns: e.target.checked } : null))} />
            </label>
          </>
        )}
        {clips.length > 0 && (
          <>
            <p className="label">Fit all clips</p>
            <Chips options={FITS} value={clips.every((c) => c.fit === clips[0].fit) ? clips[0].fit : null} onChange={(v) => onAllClips(() => ({ fit: v }))} />
          </>
        )}
      </div>
    </div>
  )
}

// ---- timeline -----------------------------------------------------------------------------------
export function Timeline({ timeline, project, t, selected, onSelect, selectedText, onSelectText, onSeek, onReorder, onAdd, loadingCount }) {
  const wrapRef = useRef(null)
  const [width, setWidth] = useState(800)
  const [zoom, setZoom] = useState(1)
  const dragId = useRef(null)
  const [dropTarget, setDropTarget] = useState(null)

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    if (wrapRef.current) ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  const total = timeline.total
  const pps = Math.max(18, Math.min(160, (width - 40) / Math.max(total, 4))) * zoom
  const full = Math.max(width - 24, total * pps + 40)
  const step = pps > 60 ? 1 : pps > 25 ? 2 : 5

  function seekFrom(e) {
    const r = e.currentTarget.getBoundingClientRect()
    onSeek(Math.max(0, Math.min(total, (e.clientX - r.left) / pps)))
  }

  return (
    <div className="timeline glass">
      <div className="timeline-head">
        <button className="btn btn-primary btn-sm" onClick={onAdd}>
          <Icon name="plus" size={15} /> Add photos / videos
        </button>
        {loadingCount > 0 && (
          <span className="muted small loading-chip">
            <span className="mini-spinner" /> Loading {loadingCount}…
          </span>
        )}
        <span className="muted small hide-xs">
          {timeline.items.length} clips · {fmt(total)}
        </span>
        <div className="zoom">
          <button className="icon-btn" onClick={() => setZoom((z) => Math.max(0.5, z / 1.4))} aria-label="Zoom out">
            −
          </button>
          <button className="icon-btn" onClick={() => setZoom((z) => Math.min(6, z * 1.4))} aria-label="Zoom in">
            +
          </button>
        </div>
      </div>
      <div className="timeline-scroll" ref={wrapRef}>
        <div className="tracks" style={{ width: full }}>
          <div
            className="ruler"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              seekFrom(e)
            }}
            onPointerMove={(e) => e.buttons && seekFrom(e)}
          >
            {Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => (
              <span key={i} style={{ left: i * step * pps }}>
                {fmt(i * step).replace(/\.0$/, '')}
              </span>
            ))}
          </div>

          <div className="track video-track" onPointerDown={(e) => e.target === e.currentTarget && seekFrom(e)}>
            {timeline.items.map((it) => (
              <button
                key={it.clip.id}
                className={`clip ${it.clip.kind} ${selected === it.clip.id ? 'active' : ''} ${dropTarget === it.clip.id ? 'drop' : ''}`}
                style={{ left: it.start * pps, width: Math.max(8, it.len * pps - 2), backgroundImage: `url(${it.clip.thumb})`, zIndex: it.index + 1 }}
                draggable
                onDragStart={(e) => {
                  dragId.current = it.clip.id
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDropTarget(it.clip.id)
                }}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDropTarget(null)
                  if (dragId.current && dragId.current !== it.clip.id) onReorder(dragId.current, it.clip.id)
                  dragId.current = null
                }}
                onClick={() => onSelect(it.clip.id)}
                title={it.clip.name}
              >
                {it.td > 0 && <span className="tr-badge">{it.type === 'fade' ? '◐' : it.type === 'slide' ? '⇢' : it.type === 'zoom' ? '⊕' : it.type === 'wipe' ? '▶' : it.type === 'flash' ? '✦' : '◌'}</span>}
                <span className="clip-label">
                  <Icon name={it.clip.kind === 'video' ? 'video' : 'image'} size={12} /> {fmt(it.len)}
                  {it.clip.kind === 'video' && it.clip.speed !== 1 && ` · ${it.clip.speed}×`}
                </span>
              </button>
            ))}
            {!timeline.items.length && <span className="track-empty">Add photos or videos to start your reel</span>}
          </div>

          <div className="track text-track" onPointerDown={(e) => e.target === e.currentTarget && seekFrom(e)}>
            {project.texts.map((x) => (
              <button key={x.id} className={`text-block ${selectedText === x.id ? 'active' : ''}`} style={{ left: x.start * pps, width: Math.max(10, (x.end - x.start) * pps - 2) }} onClick={() => onSelectText(x.id)}>
                <Icon name="type" size={11} /> {x.text}
              </button>
            ))}
            {!project.texts.length && <span className="track-empty small">Text</span>}
          </div>

          <div className="track music-track" onPointerDown={(e) => e.target === e.currentTarget && seekFrom(e)}>
            {project.music ? (
              <div className="music-block" style={{ width: Math.max(10, total * pps - 2) }}>
                <Icon name="music" size={12} /> {project.music.name}
              </div>
            ) : (
              <span className="track-empty small">Music</span>
            )}
          </div>

          <div className="playhead" style={{ left: t * pps }}>
            <span />
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- export dialog ---------------------------------------------------------------------------
export function ExportDialog({ open, onClose, total, project, exporting, onExport, onCancel }) {
  const [q, setQ] = useState(1)
  if (!open && !exporting) return null
  const mime = pickMime()
  const fmtName = mime.includes('mp4') ? 'MP4' : 'WEBM'
  const [w, h] = ASPECTS[project.aspect]
  return (
    <div className="modal-backdrop" onClick={exporting ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Export video">
        {!exporting && (
          <button className="icon-btn modal-close" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        )}
        <div className="modal-icon">
          <Icon name="film" size={26} />
        </div>
        {exporting ? (
          <>
            <h3>Exporting your video…</h3>
            <p className="muted small">Keep this tab open and visible until it finishes.</p>
            <div className="progress">
              <i style={{ width: `${Math.round(exporting.progress * 100)}%` }} />
            </div>
            <p className="small">{Math.round(exporting.progress * 100)}%</p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={onCancel}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <h3>Export video</h3>
            <p className="muted small">
              {project.aspect} · {fmt(total)} · {fmtName}
            </p>
            <div className="segmented">
              {[
                [1, 'Full HD', `${w}×${h}`],
                [2 / 3, 'HD 720p', `${Math.round((w * 2) / 3)}×${Math.round((h * 2) / 3)}`],
              ].map(([v, label, hint]) => (
                <button key={label} className={q === v ? 'active' : ''} onClick={() => setQ(v)}>
                  <b>{label}</b>
                  <small>{hint}</small>
                </button>
              ))}
            </div>
            <p className="muted small">Export runs in real time: it takes about {Math.ceil(total)} seconds.</p>
            <div className="modal-actions">
              <button className="btn btn-primary wide" onClick={() => onExport(q)} disabled={!total}>
                <Icon name="download" size={18} /> Export {fmtName}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
