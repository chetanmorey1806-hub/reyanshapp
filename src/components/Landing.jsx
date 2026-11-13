import { useRef, useState } from 'react'
import Icon from './Icons.jsx'
import DemoCard from './DemoCard.jsx'
import { ACCEPT } from '../utils/imageLoader.js'

const FEATURES = [
  { icon: 'wand', title: 'Just describe it', text: 'Type or speak the edit in English, मराठी or हिंदी. Change light, colour, background, remove objects and more.' },
  { icon: 'sliders', title: 'Every pro tool', text: 'Exposure, highlights, shadows, curves-style tone, HSL looks, clarity, crop, straighten, text, stickers and frames.' },
  { icon: 'film', title: 'Videos & reels', text: 'Turn photos into reels, trim and join clips, add songs, transitions, filters and animated text.' },
  { icon: 'mic', title: 'Voice prompts', text: 'Tap the mic and say what you want. The edit happens as soon as you stop speaking.' },
  { icon: 'layers', title: 'Any camera, any file', text: 'JPG, PNG, iPhone HEIC, TIFF, camera RAW (CR2, NEF, ARW, DNG…), MP4, MOV and WEBM.' },
  { icon: 'shield', title: 'Full quality', text: 'Before / after compare, unlimited undo and full-resolution export up to 4K.' },
]

const STEPS = [
  ['01', 'Upload', 'Drop in photos or videos straight from your camera or phone.'],
  ['02', 'Describe', 'Tell the AI what you want, typed or spoken, in your own words.'],
  ['03', 'Download', 'Fine-tune by hand, then save the photo or export the reel.'],
]

const HEADLINE = ['Edit', 'any', 'photo']

// Cards light up where the cursor is
function trackSpot(e) {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
}

export default function Landing({ onFiles, onVideo, loading, error }) {
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
              onFiles(e.dataTransfer.files)
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
                  <h2>{dragging ? 'Drop it here' : 'Upload photos or videos'}</h2>
                  <p className="muted">1 photo → photo editor · several files or a video → reel studio</p>
                </div>
                <span className="btn btn-primary">Choose photo</span>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept={`${ACCEPT},video/*`}
              multiple
              hidden
              onChange={(e) => {
                onFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
          <button className="reel-cta fade-up" style={{ '--d': '640ms' }} onClick={onVideo}>
            <span className="reel-cta-icon">
              <Icon name="film" size={18} />
            </span>
            <span>
              <b>Make a video or reel</b>
              <small>Photos → reel, trim videos, add songs, text & transitions</small>
            </span>
            <Icon name="right" size={18} />
          </button>
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
