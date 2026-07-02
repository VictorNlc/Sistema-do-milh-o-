import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import './Success.css'

interface RouteState {
  name?: string
  email?: string
  phone?: string
}

export default function Success() {
  const location = useLocation()
  const navigate = useNavigate()
  
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  
  // Confetti particles
  const [confetti, setConfetti] = useState<Array<{ id: number; left: string; color: string; size: string; delay: string; duration: string }>>([])

  useEffect(() => {
    // 1. Tentar ler dados do state de navegação
    const state = location.state as RouteState | null
    if (state?.email) {
      setClientName(state.name || '')
      setClientEmail(state.email || '')
      setClientPhone(state.phone || '')
    } else {
      // Fallback: tentar ler do sessionStorage
      try {
        const rawDetails = sessionStorage.getItem('projefarma_client_details')
        if (rawDetails) {
          const details = JSON.parse(rawDetails)
          setClientName(details.clientName || details.name || '')
          setClientEmail(details.clientEmail || details.email || '')
          setClientPhone(details.clientPhone || details.phone || '')
        }
      } catch (err) {
        console.warn('Erro ao ler detalhes do cliente do sessionStorage:', err)
      }
    }

    // 2. Gerar confetes de comemoração
    const colors = ['#167d5e', '#C5A028', '#E5C158', '#2ca686', '#bdebe0', '#FF8A8A', '#85E3FF']
    const generatedConfetti = Array.from({ length: 80 }).map((_, index) => {
      const size = Math.floor(Math.random() * 8) + 6 + 'px'
      const left = Math.random() * 100 + '%'
      const color = colors[Math.floor(Math.random() * colors.length)]
      const delay = Math.random() * 3 + 's'
      const duration = Math.random() * 2.5 + 2.5 + 's'
      return { id: index, left, color, size, delay, duration }
    })
    setConfetti(generatedConfetti)
  }, [location])

  const handleGoHome = () => {
    navigate('/')
  }

  const handleGoBack = () => {
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate('/editor')
    }
  }

  const hasDetails = !!(clientName || clientEmail || clientPhone)

  return (
    <div className="success-container">
      {/* Background decorations */}
      <div className="success-bg-grid" />
      <div className="success-bg-glow" />

      {/* Confetti celebration */}
      <div className="confetti-wrapper">
        {confetti.map((c) => (
          <div
            key={c.id}
            className="confetti-piece"
            style={{
              left: c.left,
              backgroundColor: c.color,
              width: c.size,
              height: c.size,
              animationDelay: c.delay,
              animationDuration: c.duration,
            }}
          />
        ))}
      </div>

      <div className={`success-card ${hasDetails ? 'has-details' : 'no-details'}`}>
        {/* Left Column: Mascot + Header + Action Buttons */}
        <div className="success-left-col">
          {/* Animated Mascot (Módulos Isométricos montando checkmark ✔️) */}
          <div className="mascot-wrapper">
            <svg
              className="mascot-svg isometric-canvas"
              viewBox="0 0 128 128"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Glowing checkmark trail paths (Draw dynamically during split) */}
              <path
                className="checkmark-trail-glow"
                d="M 22 94 L 62 104 L 100 50"
                stroke="#2ca686"
                strokeWidth="8"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <path
                className="checkmark-trail"
                d="M 22 94 L 62 104 L 100 50"
                stroke="#167d5e"
                strokeWidth="14"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />

              {/* Left Module (Balcão de Atendimento / Checkmark Left Leg) */}
              <g className="isometric-module-left">
                {/* Top wood face */}
                <path d="M40 60 L64 72 L48 80 L24 68 Z" fill="#FCF9F2" stroke="#0B3D2E" strokeWidth="2.5" />
                {/* Left green face */}
                <path d="M24 68 L48 80 L48 104 L24 92 Z" fill="#167d5e" stroke="#0B3D2E" strokeWidth="2.5" />
                {/* Right gold face */}
                <path d="M48 80 L64 72 L64 96 L48 104 Z" fill="#E5C158" stroke="#0B3D2E" strokeWidth="2.5" />

                {/* Shelving details inside the counter (drawn on the left face) */}
                <path d="M28 73 L44 81" stroke="#0B3D2E" strokeWidth="1.5" />
                <path d="M28 82 L44 90" stroke="#0B3D2E" strokeWidth="1.5" />
                {/* Tiny medicine boxes */}
                <rect x="30" y="74" width="4" height="3" fill="#FF8A8A" transform="skewY(26)" />
                <rect x="36" y="77" width="5" height="3" fill="#85E3FF" transform="skewY(26)" />
                <rect x="32" y="83" width="4" height="3" fill="#C5A028" transform="skewY(26)" />
              </g>

              {/* Right Module (Gôndola de Medicamentos / Checkmark Vertex) */}
              <g className="isometric-module-right">
                {/* Top wood face */}
                <path d="M64 72 L88 60 L104 68 L80 80 Z" fill="#FCF9F2" stroke="#0B3D2E" strokeWidth="2.5" />
                {/* Left green face */}
                <path d="M64 72 L80 80 L80 104 L64 96 Z" fill="#167d5e" stroke="#0B3D2E" strokeWidth="2.5" />
                {/* Right gold face */}
                <path d="M80 80 L104 68 L104 92 L80 104 Z" fill="#E5C158" stroke="#0B3D2E" strokeWidth="2.5" />

                {/* Shelving details inside the gondola (drawn on the right face) */}
                <path d="M84 77 L100 69" stroke="#0B3D2E" strokeWidth="1.5" />
                <path d="M84 86 L100 78" stroke="#0B3D2E" strokeWidth="1.5" />
                {/* Tiny medicine boxes */}
                <rect x="86" y="72" width="4" height="3" fill="#FF8A8A" transform="skewY(-26)" />
                <rect x="92" y="69" width="4" height="3" fill="#85E3FF" transform="skewY(-26)" />
              </g>

              {/* Top Module (Expositor Aéreo / Checkmark Long Leg) */}
              <g className="isometric-module-top">
                {/* Top wood face */}
                <path d="M52 36 L76 24 L92 32 L68 44 Z" fill="#FCF9F2" stroke="#0B3D2E" strokeWidth="2.5" />
                {/* Left green face */}
                <path d="M52 36 L68 44 L68 68 L52 60 Z" fill="#167d5e" stroke="#0B3D2E" strokeWidth="2.5" />
                {/* Right gold face */}
                <path d="M68 44 L92 32 L92 56 L68 68 Z" fill="#E5C158" stroke="#0B3D2E" strokeWidth="2.5" />

                {/* Decorative item sign */}
                <circle cx="78" cy="48" r="4.5" fill="#bdebe0" stroke="#0B3D2E" strokeWidth="1.5" />
              </g>
            </svg>
            <div className="mascot-shadow isometric-shadow" />
          </div>

          {/* Success Header */}
          <div className="success-header">
            <div className="success-badge-pill">✓ Envio Confirmado</div>
            <h1 className="success-title">
              <span className="success-accent-yellow">Tudo pronto!</span> Seu projeto já está a caminho.
            </h1>
            <p className="success-desc">
              Enviamos a proposta e o orçamento detalhado. Por favor, verifique a sua caixa de entrada no e-mail e mensagens no WhatsApp.
            </p>
          </div>

          {/* Actions buttons */}
          <div className="success-actions">
            <button onClick={handleGoHome} className="success-btn success-btn-primary">
              <span>🏠</span> Voltar ao Início
            </button>
            <button onClick={handleGoBack} className="success-btn success-btn-secondary">
              <span>✏️</span> Voltar ao Editor
            </button>
          </div>
        </div>

        {/* Right Column: Recipient Details */}
        {hasDetails && (
          <div className="success-right-col">
            <div className="success-details-box">
              <h4 className="success-details-header">Destinatário do Projeto</h4>
              <ul className="success-details-list">
                {clientName && (
                  <li className="success-details-item">
                    <span className="success-details-icon">👤</span>
                    <strong>Nome:</strong> {clientName}
                  </li>
                )}
                {clientEmail && (
                  <li className="success-details-item">
                    <span className="success-details-icon">✉️</span>
                    <strong>E-mail:</strong> {clientEmail}
                  </li>
                )}
                {clientPhone && (
                  <li className="success-details-item">
                    <span className="success-details-icon">💬</span>
                    <strong>WhatsApp:</strong> {clientPhone}
                  </li>
                )}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
