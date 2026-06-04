import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type {
  CanvasItem,
  ActiveTool,
  HistorySnapshot,
  LayoutStats,
  StoreType,
  PharmacyItemTemplate,
} from '../types'

// Pixels por metro no canvas (escala)
export const PIXELS_PER_METER = 60

interface CanvasState {
  // === STORE DIMENSIONS ===
  storeWidth: number
  storeHeight: number
  storeType: StoreType

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
  setActiveTool: (tool: ActiveTool) => void
  setSelectedItem: (id: string | null) => void
  setHoveredItem: (id: string | null) => void
  toggleSnapToGrid: () => void
  toggleGrid: () => void
  toggleMeasures: () => void
  setScale: (scale: number) => void
  setStagePosition: (x: number, y: number) => void
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
  storeType: 'popular',

  // === CANVAS ITEMS ===
  items: [],
  selectedItemId: null,
  hoveredItemId: null,

  // === TOOLS ===
  activeTool: 'select',
  snapToGrid: true,
  gridSize: 0.5,

  // === VIEW ===
  scale: 1,
  stageX: 0,
  stageY: 0,
  showMeasures: true,
  showGrid: true,

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
    const clampedItems = get().items.map(item => {
      const newW = Math.min(item.width, width)
      const newH = Math.min(item.height, height)
      const newX = Math.max(0, Math.min(item.x, width - newW))
      const newY = Math.max(0, Math.min(item.y, height - newH))
      return { ...item, width: newW, height: newH, x: newX, y: newY }
    })
    set({ storeWidth: width, storeHeight: height, items: clampedItems, isDirty: true })
    get().saveToHistory()
  },

  setStoreType: (type) => set({ storeType: type }),

  setActiveTool: (tool) => set({ activeTool: tool, selectedItemId: null }),

  setSelectedItem: (id) => set({ selectedItemId: id }),

  setHoveredItem: (id) => set({ hoveredItemId: id }),

  toggleSnapToGrid: () => set(s => ({ snapToGrid: !s.snapToGrid })),

  toggleGrid: () => set(s => ({ showGrid: !s.showGrid })),

  toggleMeasures: () => set(s => ({ showMeasures: !s.showMeasures })),

  setScale: (scale) => set({ scale: Math.max(0.3, Math.min(3, scale)) }),

  setStagePosition: (x, y) => set({ stageX: x, stageY: y }),

  addItem: (itemTemplate, x, y) => {
    const { storeWidth, storeHeight } = get()
    const newItem: CanvasItem = {
      id: uuidv4(),
      itemId: itemTemplate.id,
      name: itemTemplate.name,
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
      isObstacle: itemTemplate.isObstacle ?? false,
      isPillar: itemTemplate.isPillar ?? false,
      isDoor: itemTemplate.isDoor ?? false,
      isRoom: itemTemplate.isRoom ?? false,
      isEmergency: itemTemplate.isEmergency ?? false,
      isWallItem: itemTemplate.isWallItem,
      isRound: itemTemplate.isRound,
      label: itemTemplate.name,
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

    newX = Math.max(0, Math.min(newX, storeWidth - item.width))
    newY = Math.max(0, Math.min(newY, storeHeight - item.height))

    set(s => ({
      items: s.items.map(i => (i.id === id ? { ...i, x: newX, y: newY } : i)),
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
    set(s => ({
      items: s.items.map(i => (i.id === id ? { ...i, rotation: ((i.rotation || 0) + angle) % 360 } : i)),
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
    set({
      storeWidth: layoutData.storeWidth ?? 10,
      storeHeight: layoutData.storeHeight ?? 12,
      storeType: layoutData.storeType ?? 'popular',
      items: layoutData.items ?? [],
      layoutName: layoutData.layoutName ?? 'Layout',
      layoutId: layoutData.layoutId ?? null,
      shareToken: layoutData.shareToken ?? null,
      selectedItemId: null,
      isDirty: false,
    })
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
