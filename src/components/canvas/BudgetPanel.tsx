import { useMemo } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import { exportLayoutToPDF } from '../../services/pdfExport'
import './BudgetPanel.css'

interface GroupedBudgetItem {
  name: string
  icon: string
  code: string
  finish: string
  price: number
  qty: number
  total: number
}

export default function BudgetPanel() {
  const { items, storeWidth, storeHeight, storeType, layoutName } = useCanvasStore()

  // Filter items that are commercial (have a price > 0 or a code)
  const commercialItems = useMemo(() => {
    return items.filter(item => (item.price && item.price > 0) || item.code)
  }, [items])

  const groupedItems = useMemo(() => {
    const groups: Record<string, GroupedBudgetItem> = {}

    commercialItems.forEach(item => {
      const key = `${item.itemId}-${item.name}`
      if (!groups[key]) {
        groups[key] = {
          name: item.name,
          icon: item.icon || '📦',
          code: item.code || '',
          finish: item.finish || '',
          price: item.price || 0,
          qty: 0,
          total: 0,
        }
      }
      groups[key].qty++
      groups[key].total = groups[key].qty * groups[key].price
    })

    return Object.values(groups).sort((a, b) => b.total - a.total)
  }, [commercialItems])

  const totalPrice = useMemo(() => {
    return commercialItems.reduce((sum, item) => sum + (item.price || 0), 0)
  }, [commercialItems])

  const handleExportPDF = () => {
    try {
      const layoutData = { storeWidth, storeHeight, storeType, items, layoutName: layoutName || 'Meu Layout' }
      // Get reference to Konva stage
      // In Vite React, Konva stage is managed via standard references, we can pass null or find stage
      // exportLayoutToPDF is safe even if stageRef.current is missing
      const stage = document.querySelector('.konvajs-content') as unknown as { toDataURL: () => string } | null
      const fakeStageRef = {
        current: stage ? {
          toDataURL: (opts?: Record<string, unknown>) => {
            // Find canvas
            const canvas = document.querySelector('canvas')
            return canvas ? canvas.toDataURL('image/png') : ''
          }
        } : null
      }
      const success = exportLayoutToPDF(layoutData, fakeStageRef)
      if (success) {
        alert('Relatório de Orçamento PDF gerado com sucesso!')
      } else {
        alert('Erro ao gerar PDF')
      }
    } catch (err) {
      console.error(err)
      alert('Erro ao exportar orçamento em PDF')
    }
  }

  return (
    <div className="budget-root">
      <div className="budget-header">
        <h3 className="budget-title">Resumo do Orçamento</h3>
        <p className="budget-subtitle">Estimativa de custo baseada no layout planejado</p>
      </div>

      <div className="budget-list">
        {groupedItems.length === 0 ? (
          <div className="budget-empty">
            <span className="budget-empty-icon">🪙</span>
            <span>Nenhum móvel do catálogo adicionado ao layout.</span>
            <span className="budget-empty-tip">Arraste móveis das categorias "Gôndolas", "Balcões" ou "Perfumaria" para estimar o orçamento.</span>
          </div>
        ) : (
          groupedItems.map(group => (
            <div key={group.name} className="budget-card">
              <div className="budget-card-header">
                <span className="budget-card-icon">{group.icon}</span>
                <div className="budget-card-meta">
                  <span className="budget-card-name">{group.name}</span>
                  {group.code && <span className="budget-card-code">Cód: {group.code}</span>}
                </div>
                <span className="budget-card-qty">x{group.qty}</span>
              </div>
              
              {group.finish && <p className="budget-card-finish">{group.finish}</p>}
              
              <div className="budget-card-footer">
                <span className="budget-card-price">Unit: R$ {group.price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span className="budget-card-subtotal">R$ {group.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="budget-footer">
        <div className="budget-total-row">
          <span className="budget-total-label">Total Estimado</span>
          <span className="budget-total-value">
            R$ {totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <button 
          className="btn btn-primary btn-full budget-pdf-btn" 
          onClick={handleExportPDF}
          disabled={groupedItems.length === 0}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" /></svg>
          Exportar Proposta Comercial (PDF)
        </button>
      </div>
    </div>
  )
}
