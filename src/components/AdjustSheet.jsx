import Icon from './Icons.jsx'
import { DEFAULT_ADJUSTMENTS, SLIDERS } from '../utils/adjustments.js'

export default function AdjustSheet({ open, adj, onClose, onStart, onChange, onCommit }) {
  return (
    <>
      <div className={`sheet-backdrop ${open ? 'open' : ''}`} onClick={onClose} />
      <aside className={`sheet ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="sheet-head">
          <h3>Fine-tune</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">
          <div className="geo-row">
            <button className="chip-btn" onClick={() => onCommit({ ...adj, rotate: (adj.rotate + 270) % 360 })}>
              <Icon name="rotateL" size={16} /> Left
            </button>
            <button className="chip-btn" onClick={() => onCommit({ ...adj, rotate: (adj.rotate + 90) % 360 })}>
              <Icon name="rotateR" size={16} /> Right
            </button>
            <button className="chip-btn" onClick={() => onCommit({ ...adj, flipH: !adj.flipH })}>
              <Icon name="flipH" size={16} /> Mirror
            </button>
            <button className="chip-btn" onClick={() => onCommit({ ...adj, flipV: !adj.flipV })}>
              <Icon name="flipV" size={16} /> Flip
            </button>
          </div>
          {SLIDERS.map((s) => {
            const changed = adj[s.key] !== DEFAULT_ADJUSTMENTS[s.key]
            const pct = ((adj[s.key] - s.min) / (s.max - s.min)) * 100
            return (
              <div key={s.key} className={`slider ${changed ? 'changed' : ''}`}>
                <div className="slider-head">
                  <span>{s.label}</span>
                  <span className="slider-value">
                    {adj[s.key]}
                    {s.unit}
                    {changed && (
                      <button className="reset-mini" title="Reset" onClick={() => onCommit({ ...adj, [s.key]: DEFAULT_ADJUSTMENTS[s.key] })}>
                        ↺
                      </button>
                    )}
                  </span>
                </div>
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={s.step ?? 1}
                  value={adj[s.key]}
                  style={{ '--pct': `${pct}%` }}
                  onPointerDown={onStart}
                  onChange={(e) => onChange({ ...adj, [s.key]: Number(e.target.value) })}
                  aria-label={s.label}
                />
              </div>
            )
          })}
        </div>
      </aside>
    </>
  )
}
