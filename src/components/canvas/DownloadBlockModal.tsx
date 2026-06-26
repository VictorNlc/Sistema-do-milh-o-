import React from 'react'
import './DownloadBlockModal.css'

interface DownloadBlockModalProps {
  isOpen: boolean
  onClose: () => void
  onRetry: () => void
}

export default function DownloadBlockModal({ isOpen, onClose, onRetry }: DownloadBlockModalProps) {
  if (!isOpen) return null

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
          <div className="dl-illustration">
            {/* Mock of browser address bar */}
            <div className="dl-browser-chrome">
              <div className="dl-chrome-dots">
                <span className="dl-dot red"></span>
                <span className="dl-dot yellow"></span>
                <span className="dl-dot green"></span>
              </div>
              <div className="dl-chrome-address-bar">
                <div className="dl-lock-wrapper">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="dl-lock-icon">
                    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                  </svg>
                </div>
                <span className="dl-domain">https://projefarma.com.br</span>
              </div>

              {/* Pulsing pointer arrow */}
              <div className="dl-arrow-pointer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="dl-bounce-up">
                  <line x1="12" y1="19" x2="12" y2="5"></line>
                  <polyline points="5 12 12 5 19 12"></polyline>
                </svg>
                <span className="dl-pointer-text">Clique aqui</span>
              </div>
            </div>

            {/* Mock of website settings panel */}
            <div className="dl-settings-dropdown">
              <div className="dl-dropdown-header">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 6 }}>
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                </svg>
                <span>Configurações do site</span>
              </div>
              <div className="dl-dropdown-item">
                <div className="dl-item-left">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 8, color: 'var(--text-3)' }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>Downloads automáticos</span>
                </div>
                <div className="dl-dropdown-toggle">
                  <span className="dl-toggle-option">Permitir</span>
                  <span className="dl-toggle-check">●</span>
                </div>
              </div>
            </div>
          </div>

          <div className="dl-instructions">
            <h3>Como permitir downloads automáticos:</h3>
            <ol>
              <li>Clique no ícone de bloqueio ou configurações ao lado da barra de endereço.</li>
              <li>Abra as configurações do site.</li>
              <li>Procure pela opção <strong>"Downloads automáticos"</strong>.</li>
              <li>Altere para <strong>"Permitir"</strong>.</li>
              <li>Feche a janela e clique novamente em <strong>"Exportar PDF"</strong>.</li>
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
