import React from 'react'

export type BrowserType = 'safari' | 'chromium'

export function detectBrowser(): BrowserType {
  // 1. Check userAgentData if available (modern Chromium browsers support this)
  const uaData = (navigator as any).userAgentData
  if (uaData && Array.isArray(uaData.brands)) {
    const isChromiumBrand = uaData.brands.some((b: any) => {
      const brand = b.brand.toLowerCase()
      return (
        brand.includes('chrome') ||
        brand.includes('chromium') ||
        brand.includes('edge') ||
        brand.includes('brave') ||
        brand.includes('opera') ||
        brand.includes('vivaldi')
      )
    })
    if (isChromiumBrand) return 'chromium'
  }

  // 2. Check userAgent string
  const ua = navigator.userAgent.toLowerCase()

  const isChromiumUA =
    ua.includes('chrome') ||
    ua.includes('crios') ||
    ua.includes('chromium') ||
    ua.includes('edg') ||
    ua.includes('opr') ||
    ua.includes('brave') ||
    ua.includes('vivaldi') ||
    ua.includes('arc')

  if (isChromiumUA) {
    return 'chromium'
  }

  // Safari check (Safari UA has 'safari' and Apple hardware/os signatures but no 'chrome'/'chromium')
  const isSafariUA =
    ua.includes('safari') &&
    (ua.includes('macintosh') ||
      ua.includes('iphone') ||
      ua.includes('ipad') ||
      ua.includes('mac os'))
  if (isSafariUA) {
    return 'safari'
  }

  return 'chromium'
}

export function SafariGuide() {
  return (
    <div className="dl-guide-card safari-card">
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

        {/* Pointer on the LEFT pointing to the lock icon */}
        <div className="dl-arrow-pointer safari-pointer">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="dl-bounce-up">
            <line x1="12" y1="19" x2="12" y2="5"></line>
            <polyline points="5 12 12 5 19 12"></polyline>
          </svg>
          <span className="dl-pointer-text">Clique aqui</span>
        </div>
      </div>

      <div className="dl-settings-dropdown safari-dropdown">
        <div className="dl-dropdown-header">
          <span>Ajustes para projefarma.com.br</span>
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
  )
}

export function ChromiumGuide() {
  return (
    <div className="dl-guide-card chromium-card">
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
          <span className="dl-domain">https://seusite.com</span>

          {/* Blocked Download icon on the RIGHT */}
          <div className="dl-right-icon-blocked">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="dl-blocked-down-icon">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
              <line x1="3" y1="3" x2="21" y2="21" stroke="#ef4444" strokeWidth="3" />
            </svg>
          </div>
        </div>

        {/* Pointer on the RIGHT pointing to the blocked icon */}
        <div className="dl-arrow-pointer chromium-pointer">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="dl-bounce-up">
            <line x1="12" y1="19" x2="12" y2="5"></line>
            <polyline points="5 12 12 5 19 12"></polyline>
          </svg>
          <span className="dl-pointer-text">Clique aqui</span>
        </div>
      </div>

      {/* Mock of Chrome Blocked Download Dialog (chrome-bloq) */}
      <div className="dl-chrome-bloq-dialog">
        <div className="dl-bloq-header">
          <span className="dl-bloq-title">Este site tentou baixar vários arquivos automaticamente</span>
          <button className="dl-bloq-close-btn" disabled>✕</button>
        </div>

        <div className="dl-bloq-options">
          {/* Option 1: ALWAYS ALLOW (Click target!) */}
          <div className="dl-bloq-option-row highlight-target">
            <div className="dl-bloq-radio-outer">
              <span className="dl-bloq-radio-inner"></span>
            </div>
            <span className="dl-bloq-option-text">
              Sempre permitir que <strong>https://seusite.com</strong> faça download de vários arquivos
            </span>
          </div>

          {/* Option 2: KEEP BLOCKING */}
          <div className="dl-bloq-option-row selected">
            <div className="dl-bloq-radio-outer checked">
              <span className="dl-bloq-radio-inner checked"></span>
            </div>
            <span className="dl-bloq-option-text">
              Continuar a bloquear downloads automáticos de vários arquivos
            </span>
          </div>
        </div>

        <div className="dl-bloq-actions">
          <button className="dl-bloq-btn-manage" disabled>Gerenciar</button>
          <button className="dl-bloq-btn-done" disabled>Concluído</button>
        </div>
      </div>
    </div>
  )
}

interface DownloadGuideProps {
  browser: BrowserType
}

export default function DownloadGuide({ browser }: DownloadGuideProps) {
  if (browser === 'safari') {
    return <SafariGuide />
  }
  return <ChromiumGuide />
}
