import { useState, useCallback, useMemo } from 'react'
import { PHARMACY_ITEMS } from '../../data/items'
import { cleanItemName } from '../../utils/labels'
import { useCanvasStore } from '../../store/canvasStore'
import { toast } from '../../store/toastStore'
import { generateAILayout } from '../../services/heuristicLayoutGenerator'
import type { ItemCategory, PharmacyItemTemplate } from '../../types'
import './ItemLibrary.css'

interface ItemLibraryProps {
  onItemAdded?: () => void
  onOpenFloorPlanReader?: () => void
}

const SIDEBAR_CATEGORIES = [
  { id: 'shelving', label: 'BIBLIOTECA', iconKey: 'shelving' },
  { id: 'counters', label: 'BALCÕES', iconKey: 'counters' },
  { id: 'displays', label: 'DISPLAYS', iconKey: 'displays' },
  { id: 'furniture', label: 'MÓVEIS', iconKey: 'furniture' },
  { id: 'rx', label: 'EQUIPAMENTOS', iconKey: 'rx' },
  { id: 'structure', label: 'ESTRUTURA', iconKey: 'structure' },
]

const CATEGORY_MAP: Record<string, ItemCategory[]> = {
  shelving: ['GONDOLAS', 'REFRIGERACAO'],
  counters: ['BALCOES'],
  displays: ['PERFUMARIA'],
  furniture: ['OPERACIONAL'],
  rx: ['SERVICOS'],
  structure: ['ESTRUTURA', 'ACESSIBILIDADE'],
}

const getCategoryIconSvg = (key: string) => {
  switch (key) {
    case 'shelving':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="3" y1="15" x2="21" y2="15" />
        </svg>
      )
    case 'counters':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
      )
    case 'displays':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )
    case 'furniture':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      )
    case 'rx':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="12" y1="7" x2="12" y2="17" />
          <line x1="7" y1="12" x2="17" y2="12" />
        </svg>
      )
    case 'structure':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="m9 9 6 6M15 9l-6 6" />
        </svg>
      )
    default:
      return null
  }
}

const getItemIcon = (category: string, id: string, name: string) => {
  const nameLower = name.toLowerCase()
  const idLower = id.toLowerCase()

  if (idLower.includes('pilar') || idLower.includes('coluna')) {
    return (
      <svg viewBox="0 0 64 64" fill="none" style={{ width: 44, height: 44 }}>
        <polygon points="18,48 32,56 46,48 46,18 32,26 18,18" fill="rgba(148, 163, 184, 0.2)" stroke="#94A3B8" strokeWidth="1.5" />
        <line x1="32" y1="56" x2="32" y2="26" stroke="#94A3B8" strokeWidth="1.5" />
        <polygon points="18,18 32,26 46,18 32,10" fill="rgba(148, 163, 184, 0.4)" stroke="#94A3B8" strokeWidth="1.5" />
      </svg>
    )
  }
  if (idLower.includes('porta') || idLower.includes('saida')) {
    return (
      <svg viewBox="0 0 64 64" fill="none" style={{ width: 44, height: 44 }}>
        <polygon points="10,44 42,54 42,24 10,14" fill="rgba(239, 68, 68, 0.15)" stroke="#EF4444" strokeWidth="1.5" />
        <path d="M42,39 C46,35 46,29 42,24" stroke="#EF4444" strokeWidth="1.5" strokeDasharray="3 3" />
      </svg>
    )
  }
  if (nameLower.includes('cadeira') || nameLower.includes('mocho') || nameLower.includes('banqueta') || nameLower.includes('poltrona')) {
    return (
      <svg viewBox="0 0 64 64" fill="none" style={{ width: 44, height: 44 }}>
        <path d="M22,48 L42,48 M32,40 L32,54 M25,43 L39,53" stroke="#4B5563" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="32" y1="40" x2="32" y2="30" stroke="#374151" strokeWidth="2.5" />
        <ellipse cx="32" cy="30" rx="12" ry="6" fill="#107C3F" stroke="#0C5F30" strokeWidth="1" />
        <path d="M18,29 C18,25 21,25 21,29" stroke="#374151" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M46,29 C46,25 43,25 43,29" stroke="#374151" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M32,30 L32,18" stroke="#374151" strokeWidth="2" />
        <ellipse cx="32" cy="18" rx="8" ry="6" fill="#FCD34D" stroke="#D97706" strokeWidth="1" />
      </svg>
    )
  }
  if (nameLower.includes('cofre') || idLower.includes('safe')) {
    return (
      <svg viewBox="0 0 64 64" fill="none" style={{ width: 44, height: 44 }}>
        <polygon points="16,46 32,56 32,26 16,16" fill="#0C5F30" stroke="#073B1E" strokeWidth="1" />
        <polygon points="32,56 48,46 48,16 32,26" fill="#107C3F" stroke="#0C5F30" strokeWidth="1" />
        <polygon points="16,16 32,26 48,16 32,6" fill="#FCD34D" stroke="#D97706" strokeWidth="1" />
        <circle cx="40" cy="31" r="4" fill="#E5E7EB" stroke="#9CA3AF" strokeWidth="1" />
        <line x1="40" y1="27" x2="40" y2="35" stroke="#9CA3AF" />
        <line x1="36" y1="31" x2="44" y2="31" stroke="#9CA3AF" />
      </svg>
    )
  }
  if (category === 'GONDOLAS') {
    if (nameLower.includes('ponta') || idLower.includes('end')) {
      return (
        <svg viewBox="0 0 64 64" fill="none" style={{ width: 44, height: 44 }}>
          <polygon points="18,50 32,56 46,50 32,44" fill="rgba(0,0,0,0.15)" />
          <polygon points="18,46 32,52 46,46 46,42 32,38 18,42" fill="#107C3F" stroke="#0C5F30" strokeWidth="1" />
          <polygon points="18,46 32,52 32,48 18,42" fill="#0C5F30" />
          <polygon points="32,52 46,46 46,42 32,48" fill="#14944C" />
          <rect x="30" y="10" width="4" height="34" fill="#374151" />
          <polygon points="20,40 32,44 44,40 44,37 32,33 20,36" fill="#FCD34D" stroke="#D97706" strokeWidth="0.75" />
          <polygon points="20,40 32,44 32,41 20,37" fill="#D97706" />
          <polygon points="32,44 44,40 44,37 32,41" fill="#FDE047" />
          <polygon points="22,30 32,34 42,30 42,27 32,23 22,26" fill="#FCD34D" stroke="#D97706" strokeWidth="0.75" />
          <polygon points="22,30 32,34 32,31 22,27" fill="#D97706" />
          <polygon points="32,34 42,30 42,27 32,31" fill="#FDE047" />
        </svg>
      )
    }
    return (
      <svg viewBox="0 0 64 64" fill="none" style={{ width: 44, height: 44 }}>
        <polygon points="12,50 32,58 52,50 32,42" fill="rgba(0,0,0,0.15)" />
        <polygon points="12,46 32,54 52,46 32,38" fill="#107C3F" stroke="#0C5F30" strokeWidth="1" />
        <polygon points="12,46 32,54 32,50 12,42" fill="#0C5F30" />
        <polygon points="32,54 52,46 52,42 32,50" fill="#14944C" />
        <rect x="31" y="12" width="2" height="32" fill="#374151" />
        <polygon points="15,38 32,44 49,38 32,32" fill="#FCD34D" stroke="#D97706" strokeWidth="0.75" />
        <polygon points="15,38 32,44 32,42 15,36" fill="#D97706" />
        <polygon points="32,44 49,38 49,36 32,42" fill="#FDE047" />
        <polygon points="17,28 32,34 47,28 32,22" fill="#FCD34D" stroke="#D97706" strokeWidth="0.75" />
        <polygon points="17,28 32,34 32,32 17,26" fill="#D97706" />
        <polygon points="32,34 47,28 47,26 32,32" fill="#FDE047" />
        <polygon points="19,18 32,23 45,18 32,13" fill="#FCD34D" stroke="#D97706" strokeWidth="0.75" />
        <polygon points="19,18 32,23 32,21 19,16" fill="#D97706" />
        <polygon points="32,23 45,18 45,16 32,21" fill="#FDE047" />
      </svg>
    )
  }
  if (category === 'BALCOES' || nameLower.includes('balcão') || nameLower.includes('check-out') || nameLower.includes('caixa')) {
    if (nameLower.includes('check-out') || nameLower.includes('caixa') || nameLower.includes('checkout')) {
      return (
        <svg viewBox="0 0 64 64" fill="none" style={{ width: 44, height: 44 }}>
          <polygon points="12,46 44,58 52,52 20,40" fill="rgba(0,0,0,0.15)" />
          <polygon points="12,42 42,54 42,30 12,18" fill="#0C5F30" />
          <polygon points="42,54 52,48 52,24 42,30" fill="#107C3F" />
          <polygon points="12,18 42,30 52,24 22,12" fill="#FCD34D" stroke="#D97706" strokeWidth="1" />
          <polygon points="15,19 33,26 36,24 18,17" fill="#374151" />
          <rect x="42" y="16" width="5" height="4" fill="#374151" />
        </svg>
      )
    }
    return (
      <svg viewBox="0 0 64 64" fill="none" style={{ width: 44, height: 44 }}>
        <polygon points="10,48 42,60 54,52 22,40" fill="rgba(0,0,0,0.15)" />
        <polygon points="10,44 42,56 42,32 10,20" fill="#0C5F30" />
        <polygon points="42,56 54,48 54,24 42,32" fill="#107C3F" stroke="#0C5F30" strokeWidth="0.5" />
        <polygon points="10,20 42,32 54,24 22,12" fill="#FCD34D" stroke="#D97706" strokeWidth="1" />
      </svg>
    )
  }
  if (category === 'PERFUMARIA') {
    return (
      <svg viewBox="0 0 64 64" fill="none" style={{ width: 44, height: 44 }}>
        <polygon points="20,10 44,10 44,52 20,52" fill="#1F2937" stroke="#111827" />
        <polygon points="16,12 20,10 20,52 16,54" fill="#107C3F" />
        <polygon points="44,10 48,12 48,54 44,52" fill="#107C3F" />
        <polygon points="18,20 46,20 46,22 18,22" fill="#FCD34D" />
        <polygon points="18,30 46,30 46,32 18,32" fill="#FCD34D" />
        <polygon points="18,40 46,40 46,42 18,42" fill="#FCD34D" />
        <rect x="23" y="15" width="3" height="5" fill="#EC4899" rx="0.5" />
        <rect x="30" y="14" width="3" height="6" fill="#3B82F6" rx="0.5" />
        <rect x="37" y="16" width="4" height="4" fill="#10B981" rx="0.5" />
      </svg>
    )
  }
  if (category === 'REFRIGERACAO') {
    return (
      <svg viewBox="0 0 64 64" fill="none" style={{ width: 44, height: 44 }}>
        <rect x="18" y="10" width="28" height="42" fill="#1E293B" stroke="#475569" strokeWidth="2" rx="2" />
        <rect x="22" y="14" width="20" height="18" fill="rgba(14, 165, 233, 0.15)" stroke="#0EA5E9" strokeWidth="1.5" />
        <line x1="22" y1="23" x2="42" y2="23" stroke="#0EA5E9" strokeWidth="1" />
        <rect x="22" y="36" width="20" height="12" fill="rgba(148, 163, 184, 0.2)" stroke="#94A3B8" strokeWidth="1" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 64 64" fill="none" style={{ width: 44, height: 44 }}>
      <polygon points="16,46 32,56 48,46 32,36" fill="rgba(16, 185, 129, 0.15)" stroke="#10B981" strokeWidth="1.5" />
      <polygon points="16,46 32,56 32,46" fill="#0C5F30" />
      <polygon points="32,56 48,46 32,46" fill="#14944C" />
      <polygon points="16,36 32,46 48,36 32,26" fill="#FCD34D" stroke="#D97706" strokeWidth="1" />
    </svg>
  )
}

export default function ItemLibrary({ onItemAdded, onOpenFloorPlanReader }: ItemLibraryProps) {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('shelving')
  const [subFilter, setSubFilter] = useState<'all' | 'shelves' | 'counters' | 'displays' | 'furniture'>('all')
  const { addItem, storeWidth, storeHeight, storeType } = useCanvasStore()

  const handleDragStart = (e: React.DragEvent, item: PharmacyItemTemplate) => {
    e.dataTransfer.setData('application/json', JSON.stringify(item))
    e.dataTransfer.effectAllowed = 'copy'
  }

  const handleTapAdd = useCallback((item: PharmacyItemTemplate) => {
    addItem(item, storeWidth / 2 - item.width / 2, storeHeight / 2 - item.height / 2)
    toast.success(`${item.name} adicionado`)
    onItemAdded?.()
  }, [addItem, storeWidth, storeHeight, onItemAdded])

  const handleAiGenerate = async () => {
    try {
      const current = useCanvasStore.getState().items
      const density = useCanvasStore.getState().layoutDensity || 'normal'
      const result = await generateAILayout(storeWidth, storeHeight, storeType, current, density)
      if (result.valid || result.items.length > 0) {
        const structural = current.filter(i => i.isPillar || i.isObstacle || i.isDoor || i.isEmergency || i.isRoom || i.category === 'ESTRUTURA')
        useCanvasStore.setState({ items: [...structural, ...result.items], isDirty: true })
        toast.success('Layout otimizado gerado!')
      } else {
        toast.error('Dimensões insuficientes para gerar layout')
      }
    } catch (err) {
      toast.error('Erro ao gerar layout')
    }
  }

  const filteredItems = useMemo(() => PHARMACY_ITEMS.filter(item => {
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase())
    
    let matchCat = true
    if (activeCategory) {
      const allowedCategories = CATEGORY_MAP[activeCategory]
      matchCat = allowedCategories ? allowedCategories.includes(item.category) : item.category === activeCategory
    }

    if (subFilter !== 'all') {
      if (subFilter === 'shelves') matchCat = item.category === 'GONDOLAS'
      else if (subFilter === 'counters') matchCat = item.category === 'BALCOES'
      else if (subFilter === 'displays') matchCat = item.category === 'PERFUMARIA'
      else if (subFilter === 'furniture') matchCat = item.category === 'OPERACIONAL'
    }

    const matchStoreType = storeType === 'premium'
      ? !item.id.endsWith('-especial')
      : !item.id.endsWith('-premium')
    return matchSearch && matchCat && matchStoreType
  }), [search, activeCategory, subFilter, storeType])

  return (
    <div className="lib-root">
      {/* Category Strip (Left column) */}
      <div className="lib-nav-vertical">
        {SIDEBAR_CATEGORIES.map(cat => (
          <button
            key={cat.id}
            className={`lib-nav-item ${activeCategory === cat.id ? 'active' : ''}`}
            onClick={() => { setActiveCategory(cat.id); setSubFilter('all') }}
            title={cat.label}
          >
            <div className="lib-nav-item-icon">
              {getCategoryIconSvg(cat.iconKey)}
            </div>
            <span className="lib-nav-item-text">{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Catalog Panel (Right column) */}
      <div className="lib-catalog-panel">
        <div className="lib-search-wrap">
          <div className="lib-search-ico">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
          <input
            id="lib-search"
            className="lib-search-input"
            type="search"
            placeholder="Buscar itens..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoComplete="off"
          />
        </div>

        {/* Category horizontal scroll pills */}
        <div className="lib-subfilters">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'shelves', label: 'Prateleiras' },
            { id: 'counters', label: 'Balcões' },
            { id: 'displays', label: 'Displays' },
            { id: 'furniture', label: 'Móveis' },
          ].map(pill => (
            <button
              key={pill.id}
              className={`lib-subfilter-pill ${subFilter === pill.id ? 'active' : ''}`}
              onClick={() => setSubFilter(pill.id as any)}
            >
              {pill.label}
            </button>
          ))}
        </div>

        <div className="lib-scroll-area" style={{ flex: 1, overflowY: 'auto' }}>
          <div className="lib-list">
            {filteredItems.length === 0 ? (
              <div className="lib-empty">Nenhum item encontrado</div>
            ) : (
              filteredItems.map(item => (
                <div
                  key={item.id}
                  id={`lib-${item.id}`}
                  className="lib-item"
                  draggable
                  onDragStart={e => handleDragStart(e, item)}
                  onClick={() => handleTapAdd(item)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && handleTapAdd(item)}
                  aria-label={`Adicionar ${cleanItemName(item.name)}`}
                  style={{ '--item-fill': item.fillColor, '--item-stroke': item.strokeColor } as React.CSSProperties}
                >
                  <div className="lib-swatch-svg">
                    {getItemIcon(item.category, item.id, item.name)}
                  </div>
                  <div className="lib-body">
                    <span className="lib-name">{cleanItemName(item.name)}</span>
                    <span className="lib-meta">{item.width}m × {item.height}m</span>
                  </div>
                  {item.isObstacle && <span className="lib-tag" style={{ position: 'absolute', top: 4, right: 4 }}>Fixo</span>}
                </div>
              ))
            )}
          </div>

          {/* IA Layout banner card */}
          <div className="lib-ia-card">
            <div className="lib-ia-card-head">
              <span className="lib-ia-sparkle">✨</span>
              <span className="lib-ia-title">Inteligência Artificial</span>
            </div>
            <p className="lib-ia-desc">Importe sua planta baixa por foto ou otimize o layout atual.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
              <button 
                id="btn-sidebar-floorplan"
                className="btn btn-primary btn-sm btn-full" 
                onClick={onOpenFloorPlanReader} 
                style={{ background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Importar Planta Baixa (IA)
              </button>
              <button className="btn btn-secondary btn-sm btn-full" onClick={handleAiGenerate}>
                Otimizar Layout com IA
              </button>
            </div>
          </div>
        </div>

        <div className="lib-footer">Toque para adicionar · Arraste</div>
      </div>
    </div>
  )
}
