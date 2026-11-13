import { useRef, useState } from 'react'
import Icon from './Icons.jsx'
import DemoCard from './DemoCard.jsx'
import { ACCEPT } from '../utils/imageLoader.js'

const FEATURES = [
  { icon: 'wand', title: 'Just describe it', text: 'Write the edit in English, मराठी or हिंदी. Change light, colour, background, remove objects and more.' },
  { icon: 'layers', title: 'Any camera, any file', text: 'JPG, PNG, iPhone HEIC, TIFF and camera RAW: CR2, CR3, NEF, ARW, DNG and others.' },
  { icon: 'shield', title: 'Built for professionals', text: 'Before / after compare, unlimited undo, fine-tune sliders and full-resolution export.' },
]

const STEPS = [
  ['01', 'Upload', 'Drop in a photo straight from your camera or phone.'],
  ['02', 'Describe', 'Tell the AI what you want, in your own words.'],
  ['03', 'Download', 'Compare, fine-tune and save in full quality.'],
]

const HEADLINE = ['Edit', 'any', 'photo']

// Cards light up where the cursor is
function trackSpot(e) {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
}

export default function Landing({ onFile, loading, error }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  const open = () => !loading && inputRef.current?.click()

  return (
    <main className="landing">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow fade-up" style={{ '--d': '0ms' }}>
            <span className="live-dot" /> AI photo editor for photographers
          </p>
          <h1>
            {HEADLINE.map((w, i) => (
              <span key={w} className="word" style={{ '--d': `${80 + i * 90}ms` }}>
                {w}&nbsp;
              </span>
            ))}
            <br />
            <span className="word gradient-text" style={{ '--d': '380ms' }}>
              just by describing it.
            </span>
          </h1>
          <p className="hero-sub fade-up" style={{ '--d': '480ms' }}>
            फक्त लिहा, फोटो तयार. Upload a photo, type the edit you want, and download a professional result in seconds.
          </p>

          <div
            className={`dropzone fade-up ${dragging ? 'dragging' : ''} ${loading ? 'loading' : ''}`}
            style={{ '--d': '560ms' }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const f = e.dataTransfer.files?.[0]
              if (f) onFile(f)
            }}
            onClick={open}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && open()}
            role="button"
            tabIndex={0}
            aria-label="Upload a photo"
          >
            {loading ? (
              <>
                <div className="spinner" />
                <div className="drop-text">
                  <h2>Opening your photo…</h2>
                  <p className="muted">{loading}</p>
                </div>
              </>
            ) : (
              <>
                <div className="drop-icon">
                  <Icon name="upload" size={24} />
                </div>
                <div className="drop-text">
                  <h2>{dragging ? 'Drop it here' : 'Upload a photo'}</h2>
                  <p className="muted">Drag & drop or click · JPG · PNG · HEIC · TIFF · RAW</p>
                </div>
                <span className="btn btn-primary">Choose photo</span>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onFile(f)
                e.target.value = ''
              }}
            />
          </div>
          {error && <p className="error-banner fade-up">{error}</p>}
        </div>

        <div className="hero-demo fade-up" style={{ '--d': '300ms' }}>
          <DemoCard />
        </div>
      </section>

      <section className="steps">
        {STEPS.map(([n, title, text], i) => (
          <div key={n} className="step reveal" style={{ '--d': `${700 + i * 120}ms` }}>
            <span className="step-num">{n}</span>
            <div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="features">
        {FEATURES.map((f, i) => (
          <div key={f.title} className="feature-card reveal" style={{ '--d': `${900 + i * 120}ms` }} onPointerMove={trackSpot}>
            <div className="feature-icon">
              <Icon name={f.icon} size={20} />
            </div>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </div>
        ))}
      </section>

      <footer className="foot muted small">© {new Date().getFullYear()} Stories by Reyansh</footer>
    </main>
  )
}
