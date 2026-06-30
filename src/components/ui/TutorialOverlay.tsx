import React, { useState, useEffect, useCallback } from 'react'
import './TutorialOverlay.css'

export interface TutorialStep {
  selector?: string
  title: string
  description: string
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center'
}

interface TutorialOverlayProps {
  onClose: () => void
}

const STEPS: TutorialStep[] = [
  {
    title: 'Bem-vindo ao ProjeLayout! 🚀',
    description: 'Este guia rápido vai te ensinar a desenhar a farmácia perfeita utilizando as ferramentas exclusivas da Projefarma. Vamos começar?',
    position: 'center'
  },
  {
    selector: '.lib-nav-vertical',
    title: '1. Biblioteca & Porta de Entrada 🚪',
    description: 'Aqui ficam todos os móveis do catálogo. **ATENÇÃO:** O primeiro passo obrigatório é clicar na categoria **Estrutura** (ícone de grade) e adicionar a **Porta de Entrada** para demarcar os fluxos corretos!',
    position: 'right'
  },
  {
    selector: '.editor-canvas',
    title: '2. Área de Trabalho (Canvas) 📐',
    description: 'Esta é a planta física da sua farmácia. Arraste os móveis livremente. Use o scroll do mouse para ajustar o zoom e movimente a tela arrastando o canvas com o botão direito.',
    position: 'bottom'
  },
  {
    selector: '.editor-sidebar-right',
    title: '3. Orçamento do Projeto 📊',
    description: 'Aqui é gerada automaticamente a lista de móveis adicionados com quantidades, acabamentos e o valor estimado do seu projeto. O **Resumo do Orçamento** é atualizado em tempo real conforme você distribui os itens.',
    position: 'left'
  },
  {
    selector: '#tab-ai',
    title: '4. Assistente de IA Inteligente 🤖',
    description: 'Nosso chat de IA integrado pode responder dúvidas de layout e normas ANVISA. Clique em **"Gerar Layout com IA"** para preencher a loja com uma distribuição otimizada automaticamente!',
    position: 'left'
  },
  {
    selector: '.statusbar-tools',
    title: '5. Análises e Simulações 📊',
    description: 'No rodapé, use o **Mapa de Calor** para ver zonas quentes, **Simule o Fluxo** de clientes em tempo real, ou ative a **Auditoria** de conformidade com as regras NBR 9050.',
    position: 'top'
  },
  {
    selector: '.tb-right',
    title: '6. Ações do Projeto 📑',
    description: 'No topo direito você tem acesso às opções principais do seu layout: **Salvar** o projeto na nuvem, **Compartilhar** com outras pessoas, visualizar a farmácia em **3D** e **Receber o Orçamento por E-mail**.',
    position: 'bottom'
  }
]

export default function TutorialOverlay({ onClose }: TutorialOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)

  const updateRect = useCallback(() => {
    const step = STEPS[currentStep]
    if (step.selector) {
      const el = document.querySelector(step.selector)
      if (el) {
        setRect(el.getBoundingClientRect())
        return
      }
    }
    setRect(null)
  }, [currentStep])

  useEffect(() => {
    updateRect()
    window.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect)
    // Tenta recalcular após um breve delay caso os elementos ainda estejam montando
    const timer = setTimeout(updateRect, 300)

    return () => {
      window.removeEventListener('resize', updateRect)
      window.removeEventListener('scroll', updateRect)
      clearTimeout(timer)
    }
  }, [currentStep, updateRect])

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleComplete()
    }
  }

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleComplete = () => {
    localStorage.setItem('projefarma_tutorial_seen', 'true')
    onClose()
  }

  const step = STEPS[currentStep]

  // Estilo do spotlight (box-shadow gigante sobre elemento fixado)
  const getSpotlightStyle = (): React.CSSProperties => {
    if (!rect) {
      return {
        display: 'none'
      }
    }
    return {
      position: 'fixed',
      left: rect.left - 4,
      top: rect.top - 4,
      width: rect.width + 8,
      height: rect.height + 8,
      borderRadius: '8px',
      boxShadow: '0 0 0 9999px rgba(3, 15, 10, 0.75)',
      border: '2px solid #FCD34D',
      zIndex: 9999,
      pointerEvents: 'none',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    }
  };

  const getTooltipStyle = (): React.CSSProperties => {
    const isMobile = window.innerWidth < 768

    if (isMobile) {
      const tooltipWidth = Math.min(window.innerWidth - 32, 420) // dynamic size up to 420px

      if (!rect) {
        return {
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: tooltipWidth,
          zIndex: 10000,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }
      }

      // If there is a focused element, position card fixed at the top or bottom to prevent blocking the spotlighted area
      const rectCenterY = rect.top + rect.height / 2
      const isRectInLowerHalf = rectCenterY > window.innerHeight / 2
      const left = (window.innerWidth - tooltipWidth) / 2

      if (isRectInLowerHalf) {
        return {
          position: 'fixed',
          left,
          top: 20,
          bottom: 'auto',
          width: tooltipWidth,
          zIndex: 10000,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }
      } else {
        return {
          position: 'fixed',
          left,
          top: 'auto',
          bottom: 20,
          width: tooltipWidth,
          zIndex: 10000,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }
      }
    }

    if (!rect) {
      return {
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 10000,
      }
    }

    const gap = 16
    let left = 0
    let top = 0
    const tooltipWidth = 340
    const tooltipHeight = 240

    switch (step.position) {
      case 'right':
        left = rect.right + gap
        top = rect.top + rect.height / 2 - tooltipHeight / 2
        break
      case 'left':
        left = rect.left - tooltipWidth - gap
        top = rect.top + rect.height / 2 - tooltipHeight / 2
        break
      case 'top':
        left = rect.left + rect.width / 2 - tooltipWidth / 2
        top = rect.top - tooltipHeight - gap
        break
      case 'bottom':
      default:
        left = rect.left + rect.width / 2 - tooltipWidth / 2
        top = rect.bottom + gap
        break
    }

    // Garante que não sai da viewport
    left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16))
    top = Math.max(16, Math.min(top, window.innerHeight - tooltipHeight - 16))

    return {
      position: 'fixed',
      left,
      top,
      width: tooltipWidth,
      zIndex: 10000,
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    }
  }

  return (
    <div className="tut-overlay-root">
      {/* Background escuro completo se não houver spotlight */}
      {!rect && <div className="tut-backdrop-fallback" onClick={handleComplete} />}

      {/* Spotlight cutout */}
      <div style={getSpotlightStyle()} />

      {/* Card do Tooltip */}
      <div className="tut-card" style={getTooltipStyle()}>
        <div className="tut-card-head">
          <span className="tut-card-step">{currentStep + 1} / {STEPS.length}</span>
          <button className="tut-card-skip" onClick={handleComplete}>Pular tutorial</button>
        </div>

        <div className="tut-card-body">
          <h4 className="tut-card-title">{step.title}</h4>
          <p className="tut-card-desc" dangerouslySetInnerHTML={{ __html: step.description }} />
        </div>

        <div className="tut-card-foot">
          {currentStep > 0 ? (
            <button className="btn btn-ghost btn-sm tut-btn-prev" onClick={handlePrev}>
              Anterior
            </button>
          ) : (
            <div />
          )}

          <button className="btn btn-primary btn-sm tut-btn-next" onClick={handleNext} style={{ background: '#10b981' }}>
            {currentStep === STEPS.length - 1 ? 'Concluir' : 'Próximo'}
          </button>
        </div>
      </div>
    </div>
  )
}
