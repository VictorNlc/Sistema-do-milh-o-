import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllLayoutsList, deleteLayout, saveLayout } from '../services/storage'
import type { SavedLayout } from '../types'
import './Projects.css'

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return '-' }
}

function formatBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function calcPrice(layout: SavedLayout): number {
  return (layout.items ?? []).reduce((s: number, i: any) => s + (i.price ?? 0), 0)
}

export default function Projects() {
  const navigate = useNavigate()
  const [layouts, setLayouts] = useState<SavedLayout[]>(() => getAllLayoutsList())
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'recent' | 'name' | 'price'>('recent')
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let list = layouts.filter(l =>
      (l.layoutName ?? 'Layout').toLowerCase().includes(search.toLowerCase())
    )
    if (sort === 'name') list = [...list].sort((a, b) => (a.layoutName ?? '').localeCompare(b.layoutName ?? ''))
    if (sort === 'price') list = [...list].sort((a, b) => calcPrice(b) - calcPrice(a))
    return list
  }, [layouts, search, sort])

  const totalProjects = layouts.length
  const totalPrice = layouts.reduce((s, l) => s + calcPrice(l), 0)
  const totalItems = layouts.reduce((s, l) => s + (l.items?.length ?? 0), 0)

  function handleOpen(id: string) {
    navigate(`/editor?id=${id}`)
  }

  function handleDuplicate(layout: SavedLayout) {
    const dup = saveLayout({
      ...layout,
      id: undefined as any,
      shareToken: undefined as any,
      layoutName: `${layout.layoutName ?? 'Layout'} (Cópia)`,
      createdAt: undefined as any,
    })
    if (dup) setLayouts(getAllLayoutsList())
  }

  function handleDeleteConfirm(id: string) {
    deleteLayout(id)
    setLayouts(getAllLayoutsList())
    setDeleteConfirm(null)
  }

  function handleRename(id: string, newName: string) {
    const layout = layouts.find(l => l.id === id)
    if (!layout) return
    saveLayout({ ...layout, layoutName: newName })
    setLayouts(getAllLayoutsList())
    setRenaming(null)
  }

  return (
    <div className="proj-root">
      {/* Header */}
      <header className="proj-header">
        <button className="proj-header-brand" onClick={() => navigate('/')} aria-label="Início">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="5" fill="#107C3F"/>
            <path d="M12 7v10M7 12h10" stroke="#FCD34D" strokeWidth="3" strokeLinecap="round"/>
          </svg>
          Projefarma
        </button>
        <span className="proj-header-title">Meus Projetos</span>
        <div className="proj-header-actions">
          <button className="proj-btn proj-btn-ghost" onClick={() => navigate('/editor')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Novo Projeto
          </button>
        </div>
      </header>

      {/* Body */}
      <main className="proj-body">
        {/* Hero */}
        <div className="proj-hero">
          <h1>Seus Layouts Salvos</h1>
          <p>Gerencie, compare e abra qualquer projeto abaixo</p>
        </div>

        {/* Stats */}
        <div className="proj-stats">
          <div className="proj-stat">
            <div className="proj-stat-val">{totalProjects}</div>
            <div className="proj-stat-label">Projetos</div>
          </div>
          <div className="proj-stat">
            <div className="proj-stat-val">{totalItems}</div>
            <div className="proj-stat-label">Itens Total</div>
          </div>
          <div className="proj-stat">
            <div className="proj-stat-val">{formatBRL(totalPrice)}</div>
            <div className="proj-stat-label">Orçamento Acum.</div>
          </div>
        </div>

        {/* Controls */}
        <div className="proj-controls">
          <div className="proj-search">
            <span className="proj-search-icon">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </span>
            <input
              type="text"
              placeholder="Buscar projeto..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select className="proj-sort" value={sort} onChange={e => setSort(e.target.value as any)}>
            <option value="recent">Mais recentes</option>
            <option value="name">Nome A-Z</option>
            <option value="price">Maior preço</option>
          </select>
          <button className="proj-btn proj-btn-primary" onClick={() => navigate('/editor')}>
            + Novo Projeto
          </button>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="proj-empty">
            <div className="proj-empty-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9h18M9 21V9"/>
              </svg>
            </div>
            <h3>Nenhum projeto encontrado</h3>
            <p>{search ? 'Tente um termo diferente.' : 'Crie seu primeiro layout para começar!'}</p>
          </div>
        ) : (
          <div className="proj-grid">
            {filtered.map(layout => {
              const price = calcPrice(layout)
              const itemCount = (layout.items ?? []).filter((i: any) => !i.isPillar && !i.isDoor).length
              return (
                <div key={layout.id} className="proj-card" onClick={() => handleOpen(layout.id)}>
                  {/* Thumbnail */}
                  <div className="proj-card-thumb">
                    {layout.thumbnail ? (
                      <img src={layout.thumbnail} alt={layout.layoutName ?? 'Layout'} />
                    ) : (
                      <div className="proj-card-thumb-placeholder">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2"/>
                          <path d="M3 9h18M9 21V9"/>
                        </svg>
                        <span>Sem miniatura</span>
                      </div>
                    )}
                    <div className="proj-card-badge">{layout.storeWidth}×{layout.storeHeight}m</div>
                  </div>

                  {/* Body */}
                  <div className="proj-card-body">
                    <div className="proj-card-name">{layout.layoutName ?? 'Layout sem nome'}</div>
                    <div className="proj-card-meta">
                      <span>{itemCount} itens</span>
                      <span className="proj-card-dot"/>
                      <span>{formatDate(layout.updatedAt)}</span>
                    </div>
                    <div className="proj-card-price">{price > 0 ? formatBRL(price) : '—'}</div>
                  </div>

                  {/* Footer actions */}
                  <div className="proj-card-footer" onClick={e => e.stopPropagation()}>
                    <button className="proj-card-action" title="Abrir" onClick={() => handleOpen(layout.id)}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                      </svg>
                      Abrir
                    </button>
                    <button className="proj-card-action" title="Duplicar" onClick={() => handleDuplicate(layout)}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                      </svg>
                      Duplicar
                    </button>
                    <button className="proj-card-action" title="Renomear" onClick={() => setRenaming({ id: layout.id, name: layout.layoutName ?? 'Layout' })}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                      Renomear
                    </button>
                    <button className="proj-card-action danger" title="Excluir" onClick={() => setDeleteConfirm(layout.id)}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/>
                      </svg>
                      Excluir
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Rename Modal */}
      {renaming && (
        <div className="proj-rename-overlay" onClick={() => setRenaming(null)}>
          <div className="proj-rename-modal" onClick={e => e.stopPropagation()}>
            <h3>Renomear Projeto</h3>
            <input
              autoFocus
              type="text"
              value={renaming.name}
              onChange={e => setRenaming({ ...renaming, name: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') handleRename(renaming.id, renaming.name) }}
              maxLength={60}
            />
            <div className="proj-rename-actions">
              <button className="proj-btn proj-btn-ghost" style={{ flex: 1 }} onClick={() => setRenaming(null)}>Cancelar</button>
              <button className="proj-btn proj-btn-primary" style={{ flex: 1 }} onClick={() => handleRename(renaming.id, renaming.name)}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="proj-rename-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="proj-rename-modal" onClick={e => e.stopPropagation()}>
            <h3>Excluir projeto?</h3>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: 0 }}>
              Esta ação não pode ser desfeita. O projeto será removido permanentemente.
            </p>
            <div className="proj-rename-actions">
              <button className="proj-btn proj-btn-ghost" style={{ flex: 1 }} onClick={() => setDeleteConfirm(null)}>Cancelar</button>
              <button className="proj-btn" style={{ flex: 1, background: '#ef4444', color: '#fff', border: '1px solid #ef4444' }} onClick={() => handleDeleteConfirm(deleteConfirm)}>Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
