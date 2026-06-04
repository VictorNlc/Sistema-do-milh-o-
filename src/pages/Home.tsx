import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './Home.css'

const FEATURES = [
  {
    icon: (
      <svg className="feat-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9" />
      </svg>
    ),
    title: 'Editor Visual Drag & Drop',
    desc: 'Arraste móveis e equipamentos para criar o layout da sua farmácia de forma intuitiva.',
  },
  {
    icon: (
      <svg className="feat-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
        <path d="M12 6v12M6 12h12" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
    title: 'Sugestões com Inteligência Artificial',
    desc: 'A IA analisa o espaço e gera um layout otimizado para o seu tipo de farmácia.',
  },
  {
    icon: (
      <svg className="feat-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="m9 9 6 6M15 9l-6 6" />
      </svg>
    ),
    title: 'Pilares e Obstáculos',
    desc: 'Marque pilares, paredes e obstáculos reais para um planejamento fiel à sua loja.',
  },
  {
    icon: (
      <svg className="feat-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="6" y1="7" x2="6" y2="17" />
        <line x1="18" y1="7" x2="18" y2="17" />
        <line x1="12" y1="9" x2="12" y2="15" />
      </svg>
    ),
    title: 'Medidas em Tempo Real',
    desc: 'Veja as dimensões e distâncias em metros enquanto posiciona cada item.',
  },
  {
    icon: (
      <svg className="feat-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
    title: 'Exportação em PDF e PNG',
    desc: 'Baixe o relatório completo do layout com planta, lista de itens e metragem.',
  },
  {
    icon: (
      <svg className="feat-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
    title: 'Agende com um Consultor',
    desc: 'Conclua o layout e agende uma reunião gratuita com um especialista Projefarma.',
  },
]

const STORE_TYPES = [
  {
    id: 'popular',
    label: 'Farmácia Popular',
    icon: (
      <svg className="store-type-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m10.5 13.5 3-3" />
        <path d="M17.5 13.5a4.95 4.95 0 1 0-7-7l-7 7a4.95 4.95 0 1 0 7 7l7-7Z" />
      </svg>
    ),
    color: '#00843D'
  },
  {
    id: 'premium',
    label: 'Farmácia Premium',
    icon: (
      <svg className="store-type-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      </svg>
    ),
    color: '#7C3AED'
  },
  {
    id: 'manipulacao',
    label: 'Manipulação',
    icon: (
      <svg className="store-type-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 3h6M10 3v5.8a2 2 0 0 1-.5 1.3L4.35 17.5a2 2 0 0 0 1.65 3h12a2 2 0 0 0 1.65-3L14.5 10.1a2 2 0 0 1-.5-1.3V3" />
      </svg>
    ),
    color: '#0891B2'
  },
  {
    id: 'completa',
    label: 'Farmácia Completa',
    icon: (
      <svg className="store-type-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    ),
    color: '#DC2626'
  },
]

const TESTIMONIALS = [
  { name: 'Ana Paula R.', city: 'São Paulo, SP', text: 'Consegui planejar toda a minha farmácia em menos de 1 hora! O consultor ficou impressionado com o layout já pronto.', rating: 5 },
  { name: 'Carlos M.', city: 'Belo Horizonte, MG', text: 'A IA sugeriu posicionar a perfumaria na entrada e as vendas aumentaram 23% no primeiro mês!', rating: 5 },
  { name: 'Fernanda L.', city: 'Curitiba, PR', text: 'Ferramenta incrível! Marquei os pilares da minha loja e o layout ficou perfeito sem nenhum obstáculo nos corredores.', rating: 5 },
]

export default function Home() {
  const navigate = useNavigate()

  useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: '0px 0px -10% 0px',
      threshold: 0.05
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('reveal-visible')
        }
      });
    }, observerOptions)

    const revealElements = document.querySelectorAll('.reveal')
    revealElements.forEach(el => observer.observe(el))

    return () => {
      revealElements.forEach(el => observer.unobserve(el))
    }
  }, [])

  return (
    <div className="home">
      {/* HEADER */}
      <header className="home-header">
        <div className="container home-header-inner">
          <div className="home-logo">
            <div className="home-logo-icon">P</div>
            <div>
              <span className="home-logo-text">ProjeLayout</span>
              <span className="home-logo-by">by Projefarma</span>
            </div>
          </div>
          <nav className="home-nav hide-mobile">
            <a href="#features">Funcionalidades</a>
            <a href="#como-funciona">Como funciona</a>
            <a href="#depoimentos">Depoimentos</a>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/editor')}>
              Criar Layout Grátis
            </button>
          </nav>
          <button className="btn btn-primary btn-sm hide-desktop" onClick={() => navigate('/editor')}>
            Começar
          </button>
        </div>
      </header>

      {/* HERO */}
      <section className="hero">
        <div className="hero-bg-decoration" />
        <div className="hero-glow-blob blob-1" />
        <div className="hero-glow-blob blob-2" />
        <div className="hero-glow-blob blob-3" />
        <div className="container hero-inner">
          <div className="hero-badge fade-in">
            <span className="badge badge-green">Novo</span>
            <span>Planejamento de layout com IA para farmácias</span>
          </div>
          <h1 className="hero-title scale-in">
            Crie o Layout Perfeito<br />
            para a Sua <span className="hero-title-highlight">Farmácia</span>
          </h1>
          <p className="hero-desc fade-in">
            Planeje o espaço da sua farmácia com inteligência artificial, arraste e solte móveis, marque pilares e obstáculos reais — e agende uma reunião gratuita com um consultor Projefarma.
          </p>
          <div className="hero-actions fade-in">
            <button
              id="btn-criar-layout"
              className="btn btn-primary btn-xl"
              onClick={() => navigate('/editor')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M9 21V9" />
              </svg>
              Criar Meu Layout Grátis
            </button>
            <button
              className="btn btn-secondary btn-lg"
              onClick={() => document.getElementById('como-funciona')?.scrollIntoView({ behavior: 'smooth' })}
            >
              Ver como funciona
            </button>
          </div>
          <p className="hero-hint">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#107C3F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 2 }}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Gratuito · Sem cadastro · Pronto em minutos
          </p>

          {/* HERO ILLUSTRATION */}
          <div className="hero-illustration scale-in">
            <div className="hero-canvas-preview">
              <div className="preview-header">
                <div className="preview-dot red" />
                <div className="preview-dot yellow" />
                <div className="preview-dot green" />
                <span className="preview-title">ProjeLayout Editor</span>
              </div>
              <img
                src="/layout_dashboard_preview.png"
                alt="ProjeLayout Dashboard Preview"
                style={{ width: '100%', height: 'auto', display: 'block', borderBottomLeftRadius: 'var(--r-xl)', borderBottomRightRadius: 'var(--r-xl)' }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* STORE TYPES */}
      <section className="store-types" id="tipos">
        <div className="container">
          <p className="section-eyebrow reveal">Para todos os modelos</p>
          <h2 className="section-title reveal">Qual é o seu tipo de farmácia?</h2>
          <div className="store-types-grid">
            {STORE_TYPES.map((type, i) => (
              <button
                key={type.id}
                id={`btn-tipo-${type.id}`}
                className="store-type-card reveal"
                onClick={() => navigate(`/editor?type=${type.id}`)}
                style={{ 
                  '--type-color': type.color,
                  transitionDelay: `${i * 80}ms`
                } as React.CSSProperties}
              >
                <span className="store-type-icon">{type.icon}</span>
                <span className="store-type-label">{type.label}</span>
                <span className="store-type-arrow">→</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="features" id="features">
        <div className="container">
          <p className="section-eyebrow reveal">Tudo que você precisa</p>
          <h2 className="section-title reveal">Funcionalidades Completas</h2>
          <div className="features-grid">
            {FEATURES.map((f, i) => (
              <div 
                key={i} 
                className="feature-card reveal" 
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <div className="feature-icon">{f.icon}</div>
                <h3 className="feature-title">{f.title}</h3>
                <p className="feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="how-it-works" id="como-funciona">
        <div className="container">
          <p className="section-eyebrow reveal">Simples e rápido</p>
          <h2 className="section-title reveal">Como funciona</h2>
          <div className="steps">
            {[
              {
                step: '01',
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <line x1="6" y1="7" x2="6" y2="17" />
                    <line x1="18" y1="7" x2="18" y2="17" />
                    <line x1="12" y1="9" x2="12" y2="15" />
                  </svg>
                ),
                title: 'Informe as dimensões',
                desc: 'Digite o comprimento e a largura da sua loja em metros.'
              },
              {
                step: '02',
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                    <path d="m9 9 6 6M15 9l-6 6" />
                  </svg>
                ),
                title: 'Marque os obstáculos',
                desc: 'Adicione pilares, paredes e portas conforme a planta real.'
              },
              {
                step: '03',
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                    <path d="M12 6v12M6 12h12" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                ),
                title: 'Gere com IA ou monte',
                desc: 'Deixe a IA sugerir ou arraste os itens manualmente.'
              },
              {
                step: '04',
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                ),
                title: 'Agende sua consultoria',
                desc: 'Salve o layout e agende uma reunião gratuita com um especialista.'
              },
            ].map((s, i) => (
              <div 
                key={i} 
                className="step reveal"
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <div className="step-number">{s.step}</div>
                <div className="step-icon">{s.icon}</div>
                <h3 className="step-title">{s.title}</h3>
                <p className="step-desc">{s.desc}</p>
                {i < 3 && <div className="step-connector" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="testimonials" id="depoimentos">
        <div className="container">
          <p className="section-eyebrow reveal">Quem já usou aprovou</p>
          <h2 className="section-title reveal">Depoimentos</h2>
          <div className="testimonials-grid">
            {TESTIMONIALS.map((t, i) => (
              <div 
                key={i} 
                className="testimonial-card reveal"
                style={{ transitionDelay: `${i * 120}ms` }}
              >
                <div className="testimonial-stars" style={{ display: 'flex', gap: '3px', marginBottom: 'var(--s4)' }}>
                  {[...Array(t.rating)].map((_, idx) => (
                    <svg key={idx} width="16" height="16" viewBox="0 0 24 24" fill="#FFB800" stroke="#FFB800" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  ))}
                </div>
                <p className="testimonial-text">"{t.text}"</p>
                <div className="testimonial-author">
                  <div className="testimonial-avatar">{t.name[0]}</div>
                  <div>
                    <div className="testimonial-name">{t.name}</div>
                    <div className="testimonial-city">{t.city}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section reveal">
        <div className="container cta-inner">
          <h2 className="cta-title">Pronto para planejar sua farmácia?</h2>
          <p className="cta-desc">Gratuito, sem cadastro, resultado em minutos.</p>
          <button
            id="btn-cta-final"
            className="btn btn-primary btn-xl glow-pulse"
            onClick={() => navigate('/editor')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            Criar Meu Layout Agora
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="home-footer">
        <div className="container home-footer-inner">
          <div className="home-logo">
            <div className="home-logo-icon small">P</div>
            <div>
              <span className="home-logo-text small">ProjeLayout</span>
              <span className="home-logo-by">by Projefarma</span>
            </div>
          </div>
          <p className="footer-copy">© 2026 Projefarma. Todos os direitos reservados.</p>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/admin')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Admin
          </button>
        </div>
      </footer>
    </div>
  )
}
