import { useMemo } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import { useShallow } from 'zustand/react/shallow'
import { getFullLayoutDataUrl } from '../../utils/canvasExport'
import { toast } from '../../store/toastStore'
import { getFurnitureIcon } from '../../utils/furnitureIcons'
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

interface BudgetPanelProps {
  onRequestEmail?: () => void
}

export default function BudgetPanel({ onRequestEmail }: BudgetPanelProps) {
  const { items, storeWidth, storeHeight, storeType, layoutName, stageInstance, freightData } = useCanvasStore(
    useShallow(state => ({
      items: state.items,
      storeWidth: state.storeWidth,
      storeHeight: state.storeHeight,
      storeType: state.storeType,
      layoutName: state.layoutName,
      stageInstance: state.stageInstance,
      freightData: state.freightData,
    }))
  )

  // Filter items that are commercial (have a price > 0 or a code) and not structural (pillars or doors)
  const commercialItems = useMemo(() => {
    return items.filter(item => ((item.price && item.price > 0) || item.code) && !item.isPillar && !item.isDoor)
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

  // PDF export removed in favor of Email Propose flow

  const formatFinish = (finish: string) => {
    if (!finish) return ''
    let text = finish.trim()
    if (text.endsWith('Contem rodapé na cor')) {
      return text + ' de sua escolha.'
    }
    if (text.endsWith('Contem rodapé na cor e fundo adesivado')) {
      return text.replace('Contem rodapé na cor e fundo adesivado', 'Contem rodapé na cor de sua escolha e fundo adesivado.')
    }
    return text
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
                <span className="budget-card-icon">
                  {getFurnitureIcon(group) ? (
                    <img src={getFurnitureIcon(group)!} alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
                  ) : (
                    group.icon
                  )}
                </span>
                <div className="budget-card-meta">
                  <span className="budget-card-name">{group.name}</span>
                  {group.code && <span className="budget-card-code">Cód: {group.code}</span>}
                </div>
                <span className="budget-card-qty">x{group.qty}</span>
              </div>

              {group.finish && <p className="budget-card-finish">{formatFinish(group.finish)}</p>}

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
          <span className="budget-total-label">Total dos Móveis</span>
          <span className="budget-total-value">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPrice)}
          </span>
        </div>
        <div className="budget-total-row">
          <span className="budget-total-label">Total do Frete</span>
          <span className="budget-total-value">
            {freightData?.freightCost != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(freightData.freightCost) : 'Não calculado'}
          </span>
        </div>
        <div className="budget-total-row budget-grand-total">
          <span className="budget-total-label">Total do Orçamento</span>
          <span className="budget-total-value">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPrice + (freightData?.freightCost || 0))}
          </span>
        </div>
        <button
          className="btn btn-primary btn-full budget-email-btn"
          style={{ background: '#3b82f6', borderColor: '#3b82f6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          onClick={onRequestEmail}
          disabled={groupedItems.length === 0}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          Receber Projeto
        </button>
      </div>
    </div>
  )
}
