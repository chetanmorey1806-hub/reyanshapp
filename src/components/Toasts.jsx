import Icon from './Icons.jsx'

export default function Toasts({ toasts }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          <Icon name={t.tone === 'error' ? 'close' : 'check'} size={16} />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  )
}
