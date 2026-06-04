// ============================================
// Tipos centralizados do ProjeLayout
// Toda a aplicação importa daqui — um único source of truth
// ============================================

// ─── Tipos de Negócio ────────────────────────────────────────────────────────

export type StoreType = 'popular' | 'premium' | 'manipulacao' | 'completa'

export type ToastType = 'success' | 'error' | 'info'

export type ItemCategory =
  | 'GONDOLAS'
  | 'BALCOES'
  | 'REFRIGERACAO'
  | 'PERFUMARIA'
  | 'SERVICOS'
  | 'OPERACIONAL'
  | 'ESTRUTURA'
  | 'ACESSIBILIDADE'

// ─── Template de Item (Biblioteca) ───────────────────────────────────────────

/** Definição estática de um item na biblioteca de móveis */
export interface PharmacyItemTemplate {
  id: string
  category: ItemCategory
  name: string
  icon: string
  description: string
  /** metros */
  width: number
  /** metros */
  height: number
  color: string
  fillColor: string
  strokeColor: string
  minWidth: number
  maxWidth: number
  minHeight: number
  maxHeight: number
  rotatable: boolean
  isObstacle?: boolean
  isPillar?: boolean
  isDoor?: boolean
  isRoom?: boolean
  isEmergency?: boolean
  isWallItem?: boolean
  isRound?: boolean
  price?: number
  finish?: string
  code?: string
  height3d?: number
}

// ─── Item no Canvas ───────────────────────────────────────────────────────────

/** Instância de um item colocado no canvas */
export interface CanvasItem {
  id: string
  itemId: string
  name: string
  icon: string
  category: ItemCategory
  /** posição X em metros */
  x: number
  /** posição Y em metros */
  y: number
  /** largura em metros */
  width: number
  /** altura/profundidade em metros */
  height: number
  fillColor: string
  strokeColor: string
  color?: string
  rotation: number
  label: string
  isObstacle?: boolean
  isPillar?: boolean
  isDoor?: boolean
  isRoom?: boolean
  isEmergency?: boolean
  isWallItem?: boolean
  isRound?: boolean
  createdAt: number
  price?: number
  finish?: string
  code?: string
  height3d?: number
}

// ─── Layout Salvo ─────────────────────────────────────────────────────────────

/** Layout completo salvo no localStorage */
export interface SavedLayout {
  id: string
  layoutName: string
  storeWidth: number
  storeHeight: number
  storeType: StoreType
  items: CanvasItem[]
  shareToken: string
  thumbnail: string | null
  createdAt: string
  updatedAt: string
  layoutId?: string | null
}

// ─── Agendamento ──────────────────────────────────────────────────────────────

export type AppointmentStatus =
  | 'novo'
  | 'em_analise'
  | 'confirmado'
  | 'proposta_enviada'
  | 'concluido'

export interface Appointment {
  id: string
  name: string
  email: string
  phone: string
  city: string
  storeType: string
  storeArea: string
  date: string
  time: string
  notes?: string
  layoutId?: string
  status: AppointmentStatus
  createdAt: string
  updatedAt?: string
}

// ─── Toast ────────────────────────────────────────────────────────────────────

export interface Toast {
  id: number
  message: string
  type: ToastType
}

// ─── Canvas Store ─────────────────────────────────────────────────────────────

export type ActiveTool = 'select' | 'pillar' | 'door' | 'measure' | 'delete'

export interface HistorySnapshot {
  items: CanvasItem[]
  storeWidth: number
  storeHeight: number
}

export interface LayoutStats {
  totalArea: string
  usedArea: string
  corridorArea: string
  occupancyRate: string
  itemCount: number
  pillars: number
  obstacles: number
}

// ─── AI Layout ───────────────────────────────────────────────────────────────

export interface AILayoutZone {
  name: string
  x: number
  y: number
  w: number
  h: number
  type: string
}

export interface AILayoutStats {
  usedArea: string
  totalArea: string
  corridorMin: number
}

export interface AILayoutResult {
  items: Partial<CanvasItem>[]
  messages: string[]
  zones?: AILayoutZone[]
  stats: AILayoutStats
  valid: boolean
}

export interface AIContext {
  storeWidth: number
  storeHeight: number
  storeType: StoreType
  itemCount: number
}
