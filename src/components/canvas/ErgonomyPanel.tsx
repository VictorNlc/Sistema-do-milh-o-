import { useState, useCallback } from 'react'
import { validateLayout, type ErgonomyIssue } from '../../services/ergonomyValidator'
import { useCanvasStore } from '../../store/canvasStore'
import './ErgonomyPanel.css'

const LEVEL_ICON: Record<string, string> = {
  error: '🔴',
  warning: '🟡',
  ok: '🟢',
}

const LEVEL_LABEL: Record<string, string> = {
  error: 'Crítico',
  warning: 'Atenção',
  ok: 'OK',
}

interface Props {
  onClose: () => void
}

export default function ErgonomyPanel({ onClose }: Props) {
  const { items, storeWidth, storeHeight } = useCanvasStore()
  const [issues, setIssues] = useState<ErgonomyIssue[]>(() =>
    validateLayout(items, storeWidth, storeHeight)
  )

  const rerun = useCallback(() => {
    setIssues(validateLayout(items, storeWidth, storeHeight))
  }, [items, storeWidth, storeHeight])

  const errors = issues.filter(i => i.level === 'error').length
  const warnings = issues.filter(i => i.level === 'warning').length
  const oks = issues.filter(i => i.level === 'ok').length

  const score = Math.round((oks / Math.max(issues.length, 1)) * 100)
  const scoreClass = score >= 80 ? 'score-great' : score >= 50 ? 'score-ok' : 'score-bad'
  const trackColor = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444'
  const scoreLabel = score >= 80 ? 'Excelente' : score >= 50 ? 'Pode Melhorar' : 'Atenção Necessária'

  return (
    <div className="ergo-panel" role="dialog" aria-label="Auditoria de Ergonomia">
      {/* Header */}
      <div className="ergo-header">
        <div className="ergo-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
          Auditoria de Ergonomia
        </div>
        <button className="ergo-close" onClick={onClose} aria-label="Fechar">✕</button>
      </div>

      {/* Score */}
      <div className="ergo-score-bar">
        <div className="ergo-score-label">Pontuação do layout</div>
        <div className="ergo-score-row">
          <div className={`ergo-score-value ${scoreClass}`}>{score}%</div>
          <div className="ergo-score-text">
            <strong style={{ color: '#fff' }}>{scoreLabel}</strong><br />
            {errors > 0 && <span style={{ color: '#ef4444' }}>{errors} crítico(s) · </span>}
            {warnings > 0 && <span style={{ color: '#f59e0b' }}>{warnings} atenção · </span>}
            <span style={{ color: '#10b981' }}>{oks} OK</span>
          </div>
        </div>
        <div className="ergo-track">
          <div
            className="ergo-track-fill"
            style={{ width: `${score}%`, background: trackColor }}
          />
        </div>
      </div>

      {/* Issues list */}
      <div className="ergo-list">
        {issues.map(issue => (
          <div key={issue.id} className={`ergo-item level-${issue.level}`}>
            <span className="ergo-icon">{LEVEL_ICON[issue.level]}</span>
            <div className="ergo-content">
              <div className="ergo-item-title">
                <span style={{ 
                  fontSize: '9px', 
                  fontWeight: 700, 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.05em',
                  marginRight: 5,
                  opacity: 0.6
                }}>
                  {LEVEL_LABEL[issue.level]}
                </span>
                {issue.title}
              </div>
              <div className="ergo-item-desc">{issue.description}</div>
              {issue.affectedIds && issue.affectedIds.length > 0 && (
                <div style={{ marginTop: 4, fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
                  {issue.affectedIds.length} módulo(s) afetado(s)
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="ergo-footer">
        <button className="ergo-btn-rerun" onClick={rerun}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-3.14"/>
          </svg>
          Re-executar auditoria
        </button>
      </div>
    </div>
  )
}
