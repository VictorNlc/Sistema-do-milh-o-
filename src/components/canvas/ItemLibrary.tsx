import { useState, useCallback } from 'react'
import { PHARMACY_ITEMS, ITEM_CATEGORIES, ITEM_COLORS_BY_CATEGORY } from '../../data/items'
import { useCanvasStore } from '../../store/canvasStore'
import { toast } from '../../store/toastStore'
import type { ItemCategory, PharmacyItemTemplate } from '../../types'
import './ItemLibrary.css'

interface ItemLibraryProps {
  onItemAdded?: () => void
}

export default function ItemLibrary({ onItemAdded }: ItemLibraryProps) {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<ItemCategory | null>(null)
  const { addItem, storeWidth, storeHeight } = useCanvasStore()

  const handleDragStart = (e: React.DragEvent, item: PharmacyItemTemplate) => {
    e.dataTransfer.setData('application/json', JSON.stringify(item))
    e.dataTransfer.effectAllowed = 'copy'
  }

  // Mobile: tap to add to center
  const handleTapAdd = useCallback((item: PharmacyItemTemplate) => {
    addItem(item, storeWidth / 2 - item.width / 2, storeHeight / 2 - item.height / 2)
    toast.success(`${item.name} adicionado`)
    onItemAdded?.()
  }, [addItem, storeWidth, storeHeight, onItemAdded])

  const categories = Object.entries(ITEM_CATEGORIES) as [ItemCategory, string][]

  const filteredItems = PHARMACY_ITEMS.filter(item => {
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase())
    const matchCat = !activeCategory || item.category === activeCategory
    return matchSearch && matchCat
  })

  return (
    <div className="lib-root">
      <div className="lib-search-wrap">
        <div className="lib-search-ico">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </div>
        <input
          id="lib-search"
          className="lib-search-input"
          type="search"
          placeholder="Buscar item..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="lib-cats">
        <button className={`lib-cat ${!activeCategory ? 'active' : ''}`} onClick={() => setActiveCategory(null)}>
          Todos
        </button>
        {categories.map(([key, label]) => (
          <button
            key={key}
            className={`lib-cat ${activeCategory === key ? 'active' : ''}`}
            style={{ '--cat': ITEM_COLORS_BY_CATEGORY[key]?.primary } as React.CSSProperties}
            onClick={() => setActiveCategory(prev => prev === key ? null : key)}
          >
            {label}
          </button>
        ))}
      </div>

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
              aria-label={`Adicionar ${item.name}`}
              style={{ '--item-fill': item.fillColor, '--item-stroke': item.strokeColor } as React.CSSProperties}
            >
              <div className="lib-swatch" style={{ background: item.fillColor, borderColor: item.strokeColor }} />
              <div className="lib-body">
                <span className="lib-name">{item.name}</span>
                <span className="lib-meta">{item.width}m × {item.height}m</span>
              </div>
              {item.isObstacle && <span className="lib-tag">Fixo</span>}
              <div className="lib-add" aria-hidden>
                <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="lib-footer">Toque para adicionar · Arraste para posicionar</div>
    </div>
  )
}
