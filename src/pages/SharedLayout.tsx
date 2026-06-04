import { useParams, useNavigate } from 'react-router-dom'
import { getLayoutByToken } from '../services/storage'
import './SharedLayout.css'

const I = {
  Search: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
  List: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" strokeWidth="3" /><line x1="3" y1="12" x2="3.01" y2="12" strokeWidth="3" /><line x1="3" y1="18" x2="3.01" y2="18" strokeWidth="3" /></svg>,
  Calendar: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
}

const CAT_ICONS = {
  GONDOLAS: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /></svg>,
  BALCOES: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>,
  REFRIGERACAO: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H7.05a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2H17a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zM2 12h20" /></svg>,
  PERFUMARIA: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" /><path d="M12 6v12M6 12h12" /><circle cx="12" cy="12" r="3" /></svg>,
  SERVICOS: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>,
  OPERACIONAL: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
  ESTRUTURA: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="m9 9 6 6M15 9l-6 6" /></svg>,
  ACESSIBILIDADE: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="1" /><path d="m9 20 3-6M13 10l-2 3M8 12h4l2-3" /><path d="M17 13a4 4 0 1 1-8 0" /></svg>,
}

const getCategoryIcon = (category: string) => {
  const Icon = CAT_ICONS[category as keyof typeof CAT_ICONS] || CAT_ICONS.GONDOLAS
  return <Icon />
}

export default function SharedLayout() {
  const { token } = useParams()
  const navigate = useNavigate()
  const layout = token ? getLayoutByToken(token) : null

  if (!layout) {
    return (
      <div className="shared-not-found">
        <div className="animate-scale-in">
          <div className="not-found-icon">
            <I.Search />
          </div>
          <h1>Layout não encontrado</h1>
          <p>Este link pode ter expirado ou é inválido.</p>
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            Criar meu layout
          </button>
        </div>
      </div>
    )
  }

  const items = layout.items || []
  const pillars = items.filter(i => i.isPillar)
  const furniture = items.filter(i => !i.isPillar && !i.isObstacle)

  return (
    <div className="shared-layout-page">
      <header className="shared-header">
        <div className="shared-logo-icon">P</div>
        <div>
          <div className="shared-logo-title">ProjeLayout</div>
          <div className="shared-logo-sub">by Projefarma</div>
        </div>
      </header>

      <div className="shared-content">
        <div className="shared-info-card card card-elevated animate-scale-in">
          <div className="shared-info-header">
            <h1 className="shared-title">{layout.layoutName || 'Layout da Farmácia'}</h1>
            <div className="shared-badges">
              <span className="badge badge-green">{layout.storeType}</span>
              <span className="badge badge-blue">{layout.storeWidth}m × {layout.storeHeight}m</span>
            </div>
          </div>

          {layout.thumbnail && (
            <img src={layout.thumbnail} alt="Layout" className="shared-thumb" />
          )}

          <div className="shared-stats">
            <div className="shared-stat">
              <span className="shared-stat-val">{(layout.storeWidth * layout.storeHeight).toFixed(0)}m²</span>
              <span className="shared-stat-label">Área total</span>
            </div>
            <div className="shared-stat">
              <span className="shared-stat-val">{furniture.length}</span>
              <span className="shared-stat-label">Itens</span>
            </div>
            <div className="shared-stat">
              <span className="shared-stat-val">{pillars.length}</span>
              <span className="shared-stat-label">Pilares</span>
            </div>
          </div>

          <div className="shared-items-list">
            <h3 className="shared-items-title">
              <I.List /> Lista de Itens
            </h3>
            <div className="shared-items-grid">
              {furniture.map((item, i) => (
                <div key={i} className="shared-item">
                  <span className="shared-item-icon">
                    {getCategoryIcon(item.category)}
                  </span>
                  <span>{item.label || item.name}</span>
                  <span className="shared-item-size">{item.width}×{item.height}m</span>
                </div>
              ))}
            </div>
          </div>

          <div className="shared-cta">
            <p>Gostou do layout? Agende uma consulta gratuita com a Projefarma!</p>
            <button className="btn btn-primary btn-full" onClick={() => navigate(`/agendar/${layout.id}`)}>
              <I.Calendar style={{ marginRight: 6 }} /> Agendar Consultoria
            </button>
            <button className="btn btn-secondary btn-full" onClick={() => navigate('/editor')}>
              Criar meu próprio layout
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
