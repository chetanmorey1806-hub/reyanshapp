import { useEffect, useRef, useState } from 'react'
import Icon from './Icons.jsx'

const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

// Voice prompt languages
const LANGS = [
  { id: 'auto', label: 'Auto', code: null },
  { id: 'en', label: 'English', code: 'en-IN' },
  { id: 'mr', label: 'मराठी', code: 'mr-IN' },
  { id: 'hi', label: 'हिंदी', code: 'hi-IN' },
]

function autoCode() {
  const l = navigator.language || ''
  return l.startsWith('mr') ? 'mr-IN' : l.startsWith('hi') ? 'hi-IN' : 'en-IN'
}

function readLang() {
  try {
    return localStorage.getItem('voiceLang') || 'auto'
  } catch {
    return 'auto'
  }
}

export default function ChatPanel({ messages, onSubmit, busy, modeLabel, suggestions = [], tools = [], title = 'AI Editor', subtitle = 'Describe any edit, in any language', placeholder = 'Describe your edit… e.g. “make the colours pop”' }) {
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const [lang, setLang] = useState(readLang)
  const [langOpen, setLangOpen] = useState(false)
  const listRef = useRef(null)
  const inputRef = useRef(null)
  const recRef = useRef(null)
  const finalRef = useRef('')

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  // auto-grow textarea
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(140, el.scrollHeight) + 'px'
  }, [text])

  function submit(value) {
    const v = value.trim()
    if (!v || busy) return
    onSubmit(v)
    setText('')
  }

  function chooseLang(id) {
    setLang(id)
    setLangOpen(false)
    try {
      localStorage.setItem('voiceLang', id)
    } catch {
      /* private mode */
    }
  }

  // Voice: speak the edit; it is applied as soon as you stop talking.
  function toggleMic() {
    if (listening) {
      recRef.current?.stop()
      return
    }
    const rec = new SpeechRecognition()
    rec.lang = LANGS.find((l) => l.id === lang)?.code || autoCode()
    rec.interimResults = true
    rec.continuous = false
    finalRef.current = ''
    rec.onresult = (e) => {
      const said = Array.from(e.results).map((r) => r[0].transcript).join('')
      setText(said)
      if (e.results[e.results.length - 1].isFinal) finalRef.current = said
    }
    rec.onend = () => {
      setListening(false)
      if (finalRef.current.trim()) submit(finalRef.current)
    }
    rec.onerror = () => setListening(false)
    recRef.current = rec
    setListening(true)
    rec.start()
  }

  const langLabel = LANGS.find((l) => l.id === lang)?.label

  return (
    <div className="chat">
      <div className="chat-head">
        <span className="bot-avatar lg">
          <Icon name="sparkle" size={18} />
        </span>
        <div className="chat-title">
          <h2>{title}</h2>
          <p className="muted small">{subtitle}</p>
        </div>
        <span className="mode-pill">
          <span className="live-dot" />
          {modeLabel}
        </span>
      </div>

      <div className="chat-list" ref={listRef}>
        {messages.map((m) => (
          <div key={m.id} className={`bubble ${m.role} ${m.tone || ''}`}>
            {m.role === 'bot' && (
              <span className="bot-avatar">
                <Icon name="sparkle" size={14} />
              </span>
            )}
            <div className="bubble-body">
              <p>{m.text}</p>
              {m.chips?.length > 0 && (
                <div className="applied">
                  {m.chips.map((c, i) => (
                    <span key={c + i} className="applied-chip">
                      <Icon name="check" size={12} /> {c}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="bubble bot">
            <span className="bot-avatar thinking">
              <Icon name="sparkle" size={14} />
            </span>
            <div className="bubble-body typing-dots">
              <i />
              <i />
              <i />
            </div>
          </div>
        )}
        {listening && (
          <div className="bubble user listening-bubble">
            <div className="bubble-body">
              <span className="wave">
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
              Listening ({langLabel})…
            </div>
          </div>
        )}
      </div>

      {tools.length > 0 && (
        <div className="ai-tools" role="list">
          {tools.map((t, i) => (
            <button key={t.label} className="ai-tool" style={{ '--d': `${i * 35}ms` }} onClick={() => !busy && onSubmit(t.prompt)} disabled={busy} title={t.prompt}>
              <span className="ai-tool-icon">{t.emoji}</span>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="suggestions" role="list">
          {suggestions.map((s, i) => (
            <button key={s} className="suggestion" style={{ '--d': `${i * 40}ms` }} onClick={() => submit(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className={`prompt-box ${busy ? 'busy' : ''} ${listening ? 'listening' : ''}`}
        onSubmit={(e) => {
          e.preventDefault()
          submit(text)
        }}
      >
        <textarea
          ref={inputRef}
          value={text}
          rows={1}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit(text)
            }
          }}
          aria-label="Edit prompt"
        />
        {SpeechRecognition && (
          <div className="mic-wrap">
            <button type="button" className="lang-btn" onClick={() => setLangOpen((o) => !o)} aria-label="Voice language">
              {lang === 'auto' ? 'A' : langLabel.slice(0, 2)}
            </button>
            {langOpen && (
              <div className="lang-menu">
                {LANGS.map((l) => (
                  <button key={l.id} type="button" className={l.id === lang ? 'active' : ''} onClick={() => chooseLang(l.id)}>
                    {l.label}
                  </button>
                ))}
              </div>
            )}
            <button type="button" className={`icon-btn mic ${listening ? 'live' : ''}`} onClick={toggleMic} data-tip={`Speak (${langLabel})`} aria-label="Voice input">
              <Icon name="mic" />
            </button>
          </div>
        )}
        <button type="submit" className="send-btn" disabled={!text.trim() || busy} aria-label="Apply edit">
          {busy ? <span className="mini-spinner" /> : <Icon name="send" />}
        </button>
      </form>
      <p className="prompt-hint muted">
        <kbd>Enter</kbd> to apply · <Icon name="mic" size={11} /> voice in English, मराठी, हिंदी
      </p>
    </div>
  )
}
