import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type {
  CanvasItem,
  ActiveTool,
  HistorySnapshot,
  LayoutStats,
  StoreType,
  LayoutDensity,
  PharmacyItemTemplate,
} from '../types'
import { clampItemPosition, getRotatedBounds } from '../utils/geometry'
import { cleanItemName } from '../utils/labels'

// Pixels por metro no canvas (escala)
export const PIXELS_PER_METER = 60

interface CanvasState {
  // === STORE DIMENSIONS ===
  storeWidth: number
  storeHeight: number
  storeType: StoreType
  layoutDensity: LayoutDensity
  // === STRUCTURAL INFO ===
  pillars: { x: number; y: number }[]
  entrance: { x: number; y: number; orientation: 'N' | 'S' | 'E' | 'W' } | null
  emergencyExit: { x: number; y: number; orientation: 'N' | 'S' | 'E' | 'W' } | null
  // === CONFIGURATION STATE ===
  isConfigured: boolean
  // === CANVAS ITEMS ===
  items: CanvasItem[]
  selectedItemId: string | null
  hoveredItemId: string | null
  // === TOOLS ===
  activeTool: ActiveTool
  snapToGrid: boolean
  gridSize: number
  // === VIEW ===
  scale: number
  stageX: number
  stageY: number
  showMeasures: boolean
  showGrid: boolean
  stageInstance: any | null
  // === HISTORY (undo/redo) ===
  history: HistorySnapshot[]
  historyIndex: number
  // === METADATA ===
  layoutName: string
  layoutId: string | null
  shareToken: string | null
  isDirty: boolean
  // === ACTIONS ===
  setStoreDimensions: (width: number, height: number) => void
  setStoreType: (type: StoreType) => void
  setLayoutDensity: (density: LayoutDensity) => void
  setPillars: (pillars: { x: number; y: number }[]) => void
  setEntrance: (entrance: { x: number; y: number; orientation: 'N' | 'S' | 'E' | 'W' } | null) => void
  setEmergencyExit: (exit: { x: number; y: number; orientation: 'N' | 'S' | 'E' | 'W' } | null) => void
  setConfigured: (configured: boolean) => void
  setActiveTool: (tool: ActiveTool) => void
  setSelectedItem: (id: string | null) => void
  setHoveredItem: (id: string | null) => void
  toggleSnapToGrid: () => void
  toggleGrid: () => void
  toggleMeasures: () => void
  setScale: (scale: number) => void
  setStagePosition: (x: number, y: number) => void
  setStageInstance: (stage: any | null) => void
  addItem: (itemTemplate: PharmacyItemTemplate, x: number, y: number) => string
  updateItemPosition: (id: string, x: number, y: number) => void
  updateItemSize: (id: string, width: number, height: number) => void
  rotateItem: (id: string, angle: number) => void
  updateItemLabel: (id: string, label: string) => void
  deleteItem: (id: string) => void
  deleteSelected: () => void
  duplicateItem: (id: string) => void
  bringToFront: (id: string) => void
  sendToBack: (id: string) => void
  clearCanvas: () => void
  loadLayout: (layoutData: Partial<CanvasState> & { items?: CanvasItem[] }) => void
  setLayoutName: (name: string) => void
  getSelectedItem: () => CanvasItem | null
  getPillars: () => CanvasItem[]
  getStats: () => LayoutStats
  saveToHistory: () => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  // === STORE DIMENSIONS ===
  storeWidth: 10,
  storeHeight: 12,
  storeType: 'premium',
  layoutDensity: 'normal',
  pillars: [],
  entrance: null,
  emergencyExit: null,
  isConfigured: false,

  // === CANVAS ITEMS ===
  items: [],
  selectedItemId: null,
  hoveredItemId: null,

  // === TOOLS ===
  activeTool: 'select',
  snapToGrid: false,
  gridSize: 0.1,

  // === VIEW ===
  scale: 1,
  stageX: 0,
  stageY: 0,
  showMeasures: true,
  showGrid: true,
  stageInstance: null,

  // === HISTORY ===
  history: [],
  historyIndex: -1,

  // === METADATA ===
  layoutName: 'Meu Layout',
  layoutId: null,
  shareToken: null,
  isDirty: false,

  // === ACTIONS ===
  setStoreDimensions: (width, height) => {
    const oldW = get().storeWidth
    const oldH = get().storeHeight

    const clampedItems = get().items.map(item => {
      const isDoor = item.isDoor || item.itemId === 'porta-entrada' || item.itemId === 'porta-saida-emergencia'
      const newW = Math.min(item.width, width)
      const newH = Math.min(item.height, height)

      if (isDoor) {
        const bounds = getRotatedBounds(item.x ?? 0, item.y ?? 0, item.width ?? 1.2, item.height ?? 0.15, item.rotation ?? 0)
        const isHorizontal = bounds.width > bounds.height

        let wall: 'Top' | 'Bottom' | 'Left' | 'Right' = 'Bottom'
        if (isHorizontal) {
          wall = (bounds.y + bounds.height / 2 < oldH / 2) ? 'Top' : 'Bottom'
        } else {
          wall = (bounds.x + bounds.width / 2 < oldW / 2) ? 'Left' : 'Right'
        }

        const dx = (item.x ?? 0) - bounds.x
        const dy = (item.y ?? 0) - bounds.y

        let newBoundsX = bounds.x
        let newBoundsY = bounds.y

        if (wall === 'Top') {
          newBoundsY = 0
          newBoundsX = Math.max(0, Math.min(bounds.x, width - bounds.width))
        } else if (wall === 'Bottom') {
          newBoundsY = height - bounds.height
          newBoundsX = Math.max(0, Math.min(bounds.x, width - bounds.width))
        } else if (wall === 'Left') {
          newBoundsX = 0
          newBoundsY = Math.max(0, Math.min(bounds.y, height - bounds.height))
        } else if (wall === 'Right') {
          newBoundsX = width - bounds.width
          newBoundsY = Math.max(0, Math.min(bounds.y, height - bounds.height))
        }

        return {
          ...item,
          width: newW,
          height: newH,
          x: Math.round((newBoundsX + dx) * 100) / 100,
          y: Math.round((newBoundsY + dy) * 100) / 100,
        }
      } else {
        const clamped = clampItemPosition(item.x, item.y, newW, newH, item.rotation || 0, width, height)
        return { ...item, width: newW, height: newH, x: clamped.x, y: clamped.y }
      }
    })

    const newEntrance = get().entrance ? (() => {
      const ent = get().entrance!
      let newX = ent.x
      let newY = ent.y
      if (ent.orientation === 'N') {
        newY = 0
        newX = Math.max(0, Math.min(ent.x, width))
      } else if (ent.orientation === 'S') {
        newY = height
        newX = Math.max(0, Math.min(ent.x, width))
      } else if (ent.orientation === 'W') {
        newX = 0
        newY = Math.max(0, Math.min(ent.y, height))
      } else if (ent.orientation === 'E') {
        newX = width
        newY = Math.max(0, Math.min(ent.y, height))
      }
      return { ...ent, x: newX, y: newY }
    })() : null

    const newEmergencyExit = get().emergencyExit ? (() => {
      const ext = get().emergencyExit!
      let newX = ext.x
      let newY = ext.y
      if (ext.orientation === 'N') {
        newY = 0
        newX = Math.max(0, Math.min(ext.x, width))
      } else if (ext.orientation === 'S') {
        newY = height
        newX = Math.max(0, Math.min(ext.x, width))
      } else if (ext.orientation === 'W') {
        newX = 0
        newY = Math.max(0, Math.min(ext.y, height))
      } else if (ext.orientation === 'E') {
        newX = width
        newY = Math.max(0, Math.min(ext.y, height))
      }
      return { ...ext, x: newX, y: newY }
    })() : null

    set({
      storeWidth: width,
      storeHeight: height,
      items: clampedItems,
      entrance: newEntrance,
      emergencyExit: newEmergencyExit,
      isDirty: true
    })
    get().saveToHistory()
  },
  setPillars: (newPillars) => {
    set(state => ({ ...state, pillars: newPillars, isDirty: true }))
    get().saveToHistory()
  },
  setEntrance: (entrance) => {
    set(state => ({ ...state, entrance, isDirty: true }))
    get().saveToHistory()
  },
  setEmergencyExit: (exit) => {
    set(state => ({ ...state, emergencyExit: exit, isDirty: true }))
    get().saveToHistory()
  },
  setConfigured: (configured) => {
    set(state => ({ ...state, isConfigured: configured, isDirty: true }))
    get().saveToHistory()
  },
  setStoreType: (type) => set({ storeType: type }),
  setLayoutDensity: (density) => set({ layoutDensity: density }),

  setActiveTool: (tool) => set({ activeTool: tool, selectedItemId: null }),

  setSelectedItem: (id) => set({ selectedItemId: id }),

  setHoveredItem: (id) => set({ hoveredItemId: id }),

  toggleSnapToGrid: () => set(s => ({ snapToGrid: !s.snapToGrid })),

  toggleGrid: () => set(s => ({ showGrid: !s.showGrid })),

  toggleMeasures: () => set(s => ({ showMeasures: !s.showMeasures })),

  setScale: (scale) => set({ scale: Math.max(0.3, Math.min(3, scale)) }),

  setStagePosition: (x, y) => set({ stageX: x, stageY: y }),
  setStageInstance: (stage) => set({ stageInstance: stage }),

  // =========================================================================
  // Adiciona um novo item no canvas
  // Lógica:
  // 1. Limpa o nome do item usando a função utilitária cleanItemName.
  // 2. Cria o objeto CanvasItem com um ID único (uuidv4).
  // 3. Limita as coordenadas iniciais (x, y) para garantir que o móvel
  //    seja criado totalmente dentro da área física da farmácia.
  // 4. Mapeia categorias e flags de comportamento estrutural (se é obstáculo,
  //    pilar, porta ou sala reservada).
  // 5. Atualiza o estado dos itens no Zustand, seleciona o item recém-adicionado
  //    e dispara a gravação no histórico de alterações para o undo/redo.
  // =========================================================================
  addItem: (itemTemplate, x, y) => {
    const { storeWidth, storeHeight } = get()
    const cleanedName = cleanItemName(itemTemplate.name)
    const newItem: CanvasItem = {
      id: uuidv4(),
      itemId: itemTemplate.id,
      name: cleanedName,
      icon: itemTemplate.icon,
      category: itemTemplate.category,
      x: Math.max(0, Math.min(x, storeWidth - itemTemplate.width)),
      y: Math.max(0, Math.min(y, storeHeight - itemTemplate.height)),
      width: itemTemplate.width,
      height: itemTemplate.height,
      fillColor: itemTemplate.fillColor,
      strokeColor: itemTemplate.strokeColor,
      color: itemTemplate.color,
      rotation: 0,
      isObstacle: itemTemplate.isObstacle ?? itemTemplate.id?.includes('obstacle') ?? false,
      isPillar: itemTemplate.isPillar ?? itemTemplate.id?.includes('pilar') ?? false,
      isDoor: itemTemplate.isDoor ?? itemTemplate.id?.includes('porta') ?? false,
      isRoom: itemTemplate.isRoom ?? (itemTemplate.category === 'SERVICOS' || itemTemplate.category === 'OPERACIONAL') ?? false,
      isEmergency: itemTemplate.isEmergency ?? itemTemplate.id?.includes('emergencia') ?? false,
      isWallItem: itemTemplate.isWallItem ?? false,
      isRound: itemTemplate.isRound ?? itemTemplate.id?.includes('display') ?? false,
      label: cleanedName,
      createdAt: Date.now(),
      price: itemTemplate.price,
      finish: itemTemplate.finish,
      code: itemTemplate.code,
      height3d: itemTemplate.height3d,
    }
    set(s => ({
      items: [...s.items, newItem],
      selectedItemId: newItem.id,
      isDirty: true,
    }))
    get().saveToHistory()
    return newItem.id
  },

  // =========================================================================
  // Atualiza a posição (x, y) de um item existente
  // Lógica:
  // 1. Busca o item pelo ID na lista atual.
  // 2. Se a opção snapToGrid (ajuste à grade) estiver ligada, arredonda as
  //    coordenadas informadas com base no tamanho do grid configurado (gridSize).
  // 3. Aplica a função clampItemPosition para assegurar que, após a movimentação
  //    ou rotação, nenhuma das pontas do móvel ultrapasse os limites da loja.
  // 4. Atualiza o array de itens no Zustand e registra o estado na pilha do histórico.
  // =========================================================================
  updateItemPosition: (id, x, y) => {
    const { storeWidth, storeHeight, snapToGrid, gridSize, items } = get()
    const item = items.find(i => i.id === id)
    if (!item) return

    let newX = x
    let newY = y

    if (snapToGrid) {
      newX = Math.round(x / gridSize) * gridSize
      newY = Math.round(y / gridSize) * gridSize
    }

    const clamped = clampItemPosition(newX, newY, item.width, item.height, item.rotation || 0, storeWidth, storeHeight)

    set(s => ({
      items: s.items.map(i => (i.id === id ? { ...i, x: clamped.x, y: clamped.y } : i)),
      isDirty: true,
    }))
    get().saveToHistory()
  },

  updateItemSize: (id, width, height) => {
    const { storeWidth, storeHeight, items } = get()
    const item = items.find(i => i.id === id)
    if (!item) return

    const newWidth = Math.max(0.2, Math.min(width, storeWidth - item.x))
    const newHeight = Math.max(0.2, Math.min(height, storeHeight - item.y))

    set(s => ({
      items: s.items.map(i => (i.id === id ? { ...i, width: newWidth, height: newHeight } : i)),
      isDirty: true,
    }))
    get().saveToHistory()
  },

  rotateItem: (id, angle) => {
    const { storeWidth, storeHeight } = get()
    set(s => ({
      items: s.items.map(i => {
        if (i.id !== id) return i
        const newRotation = ((i.rotation || 0) + angle) % 360
        const clamped = clampItemPosition(i.x, i.y, i.width, i.height, newRotation, storeWidth, storeHeight)
        return { ...i, rotation: newRotation, x: clamped.x, y: clamped.y }
      }),
      isDirty: true,
    }))
    get().saveToHistory()
  },

  updateItemLabel: (id, label) => {
    set(s => ({
      items: s.items.map(i => (i.id === id ? { ...i, label } : i)),
      isDirty: true,
    }))
  },

  deleteItem: (id) => {
    set(s => ({
      items: s.items.filter(i => i.id !== id),
      selectedItemId: s.selectedItemId === id ? null : s.selectedItemId,
      isDirty: true,
    }))
    get().saveToHistory()
  },

  deleteSelected: () => {
    const { selectedItemId, deleteItem } = get()
    if (selectedItemId) deleteItem(selectedItemId)
  },

  duplicateItem: (id) => {
    const item = get().items.find(i => i.id === id)
    if (!item) return

    const newItem: CanvasItem = {
      ...item,
      id: uuidv4(),
      x: item.x + 0.5,
      y: item.y + 0.5,
      createdAt: Date.now(),
    }
    set(s => ({
      items: [...s.items, newItem],
      selectedItemId: newItem.id,
      isDirty: true,
    }))
  },

  bringToFront: (id) => {
    set(s => {
      const item = s.items.find(i => i.id === id)
      if (!item) return s
      return { items: [...s.items.filter(i => i.id !== id), item] }
    })
  },

  sendToBack: (id) => {
    set(s => {
      const item = s.items.find(i => i.id === id)
      if (!item) return s
      return { items: [item, ...s.items.filter(i => i.id !== id)] }
    })
  },

  clearCanvas: () => {
    set({ items: [], selectedItemId: null, isDirty: true })
    get().saveToHistory()
  },

  loadLayout: (layoutData) => {
    const loadedItems = (layoutData.items ?? []).map(item => {
      const cleanName = cleanItemName(item.name || '')
      const cleanLabel = cleanItemName(item.label || '')
      return {
        ...item,
        name: cleanName,
        label: cleanLabel,
      }
    })
    set({
      storeWidth: layoutData.storeWidth ?? 10,
      storeHeight: layoutData.storeHeight ?? 12,
      storeType: layoutData.storeType ?? 'popular',
      items: loadedItems,
      pillars: layoutData.pillars ?? [],
      entrance: layoutData.entrance ?? null,
      emergencyExit: layoutData.emergencyExit ?? null,
      layoutName: layoutData.layoutName ?? 'Layout',
      layoutId: layoutData.id || layoutData.layoutId || null,
      shareToken: layoutData.shareToken ?? null,
      selectedItemId: null,
      isDirty: false,
    })
  },

  setLayoutName: (name) => {
    set({ layoutName: name, isDirty: true })
  },

  getSelectedItem: () => {
    const { items, selectedItemId } = get()
    return items.find(i => i.id === selectedItemId) ?? null
  },

  getPillars: () => {
    return get().items.filter(i => i.isPillar)
  },

  getStats: () => {
    const { items, storeWidth, storeHeight } = get()
    const totalArea = storeWidth * storeHeight
    const usedArea = items.reduce((acc, item) => acc + item.width * item.height, 0)
    const corridorArea = totalArea - usedArea
    const pillars = items.filter(i => i.isPillar).length
    const obstacles = items.filter(i => i.isObstacle).length

    return {
      totalArea: totalArea.toFixed(1),
      usedArea: usedArea.toFixed(1),
      corridorArea: corridorArea.toFixed(1),
      occupancyRate: ((usedArea / totalArea) * 100).toFixed(0),
      itemCount: items.filter(i => !i.isObstacle && !i.isPillar).length,
      pillars,
      obstacles,
    }
  },

  saveToHistory: () => {
    const { items, storeWidth, storeHeight, history, historyIndex } = get()
    const snapshot: HistorySnapshot = JSON.parse(JSON.stringify({ items, storeWidth, storeHeight }))
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(snapshot)
    if (newHistory.length > 50) newHistory.shift()
    set({ history: newHistory, historyIndex: newHistory.length - 1 })
  },

  undo: () => {
    const { history, historyIndex } = get()
    if (historyIndex <= 0) return
    const snapshot = history[historyIndex - 1]
    if (!snapshot) return
    set({
      items: snapshot.items,
      storeWidth: snapshot.storeWidth,
      storeHeight: snapshot.storeHeight,
      historyIndex: historyIndex - 1,
      selectedItemId: null,
    })
  },

  redo: () => {
    const { history, historyIndex } = get()
    if (historyIndex >= history.length - 1) return
    const snapshot = history[historyIndex + 1]
    if (!snapshot) return
    set({
      items: snapshot.items,
      storeWidth: snapshot.storeWidth,
      storeHeight: snapshot.storeHeight,
      historyIndex: historyIndex + 1,
      selectedItemId: null,
    })
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,
}))
