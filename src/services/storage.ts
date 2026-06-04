// ============================================
// localStorage service para salvar/carregar layouts
// Bug Fix: sort usa .getTime() para evitar NaN
// ============================================

import type { SavedLayout, Appointment, AppointmentStatus, CanvasItem } from '../types'

const LAYOUTS_KEY = 'projelayout_layouts'
const APPOINTMENTS_KEY = 'projelayout_appointments'

// ─── Layouts ──────────────────────────────────────────────────────────────────

type LayoutInput = {
  id?: string
  shareToken?: string
  createdAt?: string
  storeWidth: number
  storeHeight: number
  storeType: string
  items: CanvasItem[]
  layoutName?: string
  thumbnail?: string | null
  layoutId?: string | null
}

export function saveLayout(layoutData: LayoutInput): SavedLayout | null {
  const id = layoutData.id || `layout_${Date.now()}`
  const shareToken = layoutData.shareToken || `share_${Math.random().toString(36).substring(2, 14)}`
  const saved: SavedLayout = {
    ...(layoutData as SavedLayout),
    id,
    shareToken,
    updatedAt: new Date().toISOString(),
    createdAt: layoutData.createdAt || new Date().toISOString(),
    thumbnail: layoutData.thumbnail ?? null,
  }

  try {
    const layouts = getLayouts()
    layouts[id] = saved
    localStorage.setItem(LAYOUTS_KEY, JSON.stringify(layouts))
    return saved
  } catch (e) {
    console.warn('Quota de localStorage excedida no salvamento. Tentando recuperação...', e)
    try {
      // Passo 1: Remover as miniaturas de todos os layouts mais antigos para liberar espaço
      const layouts = getLayouts()
      Object.keys(layouts).forEach(key => {
        if (key !== id && layouts[key]) {
          layouts[key].thumbnail = null
        }
      })
      layouts[id] = saved
      localStorage.setItem(LAYOUTS_KEY, JSON.stringify(layouts))
      return saved
    } catch (e2) {
      console.warn('Recuperação passo 1 falhou. Salvando layout sem miniatura...', e2)
      try {
        // Passo 2: Remover a miniatura do próprio layout atual também
        const layouts = getLayouts()
        Object.keys(layouts).forEach(key => {
          if (layouts[key]) layouts[key].thumbnail = null
        })
        saved.thumbnail = null
        layouts[id] = saved
        localStorage.setItem(LAYOUTS_KEY, JSON.stringify(layouts))
        return saved
      } catch (e3) {
        console.error('Falha crítica ao salvar mesmo sem miniaturas:', e3)
        return null
      }
    }
  }
}

export function getLayouts(): Record<string, SavedLayout> {
  try {
    const raw = localStorage.getItem(LAYOUTS_KEY)
    return raw ? (JSON.parse(raw) as Record<string, SavedLayout>) : {}
  } catch {
    return {}
  }
}

export function getLayoutById(id: string): SavedLayout | null {
  const layouts = getLayouts()
  return layouts[id] ?? null
}

export function getLayoutByToken(token: string): SavedLayout | null {
  const layouts = getLayouts()
  return Object.values(layouts).find(l => l.shareToken === token) ?? null
}

export function deleteLayout(id: string): void {
  const layouts = getLayouts()
  delete layouts[id]
  localStorage.setItem(LAYOUTS_KEY, JSON.stringify(layouts))
}

export function getAllLayoutsList(): SavedLayout[] {
  // Bug fix: usa .getTime() para evitar NaN na subtração de Dates
  return Object.values(getLayouts()).sort((a, b) => {
    const bTime = new Date(b.updatedAt).getTime()
    const aTime = new Date(a.updatedAt).getTime()
    if (isNaN(bTime) || isNaN(aTime)) return 0
    return bTime - aTime
  })
}

// ─── Appointments ─────────────────────────────────────────────────────────────

type AppointmentInput = Omit<Appointment, 'id' | 'status' | 'createdAt'>

export function saveAppointment(appointmentData: AppointmentInput): Appointment | null {
  try {
    const appointments = getAppointments()
    const id = `appt_${Date.now()}`
    const saved: Appointment = {
      ...appointmentData,
      id,
      status: 'novo',
      createdAt: new Date().toISOString(),
    }
    appointments[id] = saved
    localStorage.setItem(APPOINTMENTS_KEY, JSON.stringify(appointments))
    return saved
  } catch (e) {
    console.error('Error saving appointment:', e)
    return null
  }
}

export function getAppointments(): Record<string, Appointment> {
  try {
    const raw = localStorage.getItem(APPOINTMENTS_KEY)
    return raw ? (JSON.parse(raw) as Record<string, Appointment>) : {}
  } catch {
    return {}
  }
}

export function getAllAppointmentsList(): Appointment[] {
  // Bug fix: usa .getTime() para evitar NaN
  return Object.values(getAppointments()).sort((a, b) => {
    const bTime = new Date(b.createdAt).getTime()
    const aTime = new Date(a.createdAt).getTime()
    if (isNaN(bTime) || isNaN(aTime)) return 0
    return bTime - aTime
  })
}

export function updateAppointmentStatus(id: string, status: AppointmentStatus): void {
  const appointments = getAppointments()
  if (appointments[id]) {
    appointments[id].status = status
    appointments[id].updatedAt = new Date().toISOString()
    localStorage.setItem(APPOINTMENTS_KEY, JSON.stringify(appointments))
  }
}

// ─── Export Utils ─────────────────────────────────────────────────────────────

export interface LayoutStats {
  totalArea: string
  usedArea: string
  corridorArea: string
  occupancyRate: string
  itemCount: number
  pillars: number
}

export function getLayoutStats(layout: SavedLayout | null): LayoutStats | null {
  if (!layout?.items) return null
  const items = layout.items
  const storeWidth = layout.storeWidth || 10
  const storeHeight = layout.storeHeight || 12
  const totalArea = storeWidth * storeHeight
  const usedArea = items.reduce((acc, item) => acc + item.width * item.height, 0)

  return {
    totalArea: totalArea.toFixed(1),
    usedArea: usedArea.toFixed(1),
    corridorArea: (totalArea - usedArea).toFixed(1),
    occupancyRate: ((usedArea / totalArea) * 100).toFixed(0),
    itemCount: items.filter(i => !i.isObstacle && !i.isPillar).length,
    pillars: items.filter(i => i.isPillar).length,
  }
}
