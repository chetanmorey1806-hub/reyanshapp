import { useEffect, useRef, useState } from 'react'
import Icon from './Icons.jsx'

const SUGGESTIONS = [
  'Make it bright and warm',
  'Change the sky to a golden sunset',
  'Remove people in the background',
  'Cinematic look',
  'Wedding look, soft & warm',
  'Black and white, strong contrast',
  'थोडा उजेड वाढव आणि रंग जास्त',
  'Vintage film look',
  'Moody and dark',
  'Golden hour sunset',
  'Sharp & colourful',
  'Rotate right',
]

const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

export default function ChatPanel({ messages, onSubmit, busy, modeLabel }) {
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const listRef = useRef(null)
  const inputRef = useRef(null)
  const recRef = useRef(null)

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

  function toggleMic() {
    if (listening) {
      recRef.current?.stop()
      return
    }
    const rec = new SpeechRecognition()
    rec.lang = navigator.language?.startsWith('mr') ? 'mr-IN' : navigator.language?.startsWith('hi') ? 'hi-IN' : 'en-IN'
    rec.interimResults = true
    rec.onresult = (e) => setText(Array.from(e.results).map((r) => r[0].transcript).join(''))
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recRef.current = rec
    setListening(true)
    rec.start()
  }

  return (
    <div className="chat">
      <div className="chat-head">
        <span className="bot-avatar lg">
          <Icon name="sparkle" size={18} />
        </span>
        <div className="chat-title">
          <h2>AI Editor</h2>
          <p className="muted small">Describe any edit, in any language</p>
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
                  {m.chips.map((c) => (
                    <span key={c} className="applied-chip">
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
      </div>

      <div className="suggestions" role="list">
        {SUGGESTIONS.map((s, i) => (
          <button key={s} className="suggestion" style={{ '--d': `${i * 40}ms` }} onClick={() => submit(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>

      <form
        className={`prompt-box ${busy ? 'busy' : ''}`}
        onSubmit={(e) => {
          e.preventDefault()
          submit(text)
        }}
      >
        <textarea
          ref={inputRef}
          value={text}
          rows={1}
          placeholder="Describe your edit… e.g. “make the colours pop”"
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
          <button type="button" className={`icon-btn mic ${listening ? 'live' : ''}`} onClick={toggleMic} title="Speak your edit" aria-label="Voice input">
            <Icon name="mic" />
          </button>
        )}
        <button type="submit" className="send-btn" disabled={!text.trim() || busy} aria-label="Apply edit">
          {busy ? <span className="mini-spinner" /> : <Icon name="send" />}
        </button>
      </form>
      <p className="prompt-hint muted">
        <kbd>Enter</kbd> to apply · <kbd>Shift</kbd>+<kbd>Enter</kbd> new line
      </p>
    </div>
  )
}
