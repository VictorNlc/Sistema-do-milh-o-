import React from 'react'
import DownloadGuide, { detectBrowser } from './DownloadGuide'
import './DownloadBlockModal.css'

interface DownloadBlockModalProps {
  isOpen: boolean
  onClose: () => void
  onRetry: () => void
}

export default function DownloadBlockModal({ isOpen, onClose, onRetry }: DownloadBlockModalProps) {
  if (!isOpen) return null

  const browser = detectBrowser()

  const handleUnderstand = () => {
    localStorage.setItem('multiple_downloads_allowed', 'true')
    onClose()
  }

  const handleRetry = () => {
    localStorage.setItem('multiple_downloads_allowed', 'true')
    onRetry()
  }

  return (
    <div className="dl-overlay" onClick={onClose}>
      <div className="dl-container" onClick={e => e.stopPropagation()}>
        <div className="dl-head">
          <span className="dl-title">Downloads Bloqueados</span>
          <button className="dl-close" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        <div className="dl-body">
          <div className="dl-warning-box">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="dl-warning-icon">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div className="dl-warning-text">
              Seu navegador bloqueou um ou mais downloads automáticos.
              <br /><br />
              Para exportar corretamente o projeto, permita downloads automáticos para este site.
              <br /><br />
              A seta abaixo mostra exatamente onde essa opção normalmente fica localizada.
            </div>
          </div>

          {/* Visual Guide Illustration */}
          <DownloadGuide browser={browser} />

          <div className="dl-instructions">
            <h3>Como permitir downloads automáticos:</h3>
            <ol>
              <li>Clique no ícone de bloqueio ou configurações ao lado da barra de endereço.</li>
              <li>Abra as configurações do site.</li>
              <li>Procure pela opção <strong>"Downloads automáticos"</strong>.</li>
              <li>Altere para <strong>"Permitir"</strong>.</li>
              <li>Clique em concluído e depois em <strong>"Tentar novamente"</strong>, ou feche esta caixa e clique em <strong>"Exportar PDF"</strong>.</li>
            </ol>
          </div>

          <p className="dl-note">
            A aparência pode variar um pouco dependendo do navegador (Chrome, Edge, Brave ou Opera), mas a opção geralmente fica nas configurações do site abertas pelo ícone ao lado da barra de endereço.
          </p>
          <p className="dl-note-sub">
            Essa configuração é necessária apenas uma vez para este site.
          </p>
        </div>
        <div className="dl-foot">
          <button className="btn btn-ghost btn-sm" onClick={handleUnderstand}>
            Entendi
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleRetry} style={{ background: '#10b981' }}>
            Tentar novamente
          </button>
        </div>
      </div>
    </div>
  )
}
