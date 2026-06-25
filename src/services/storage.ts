// ============================================
// localStorage service para salvar/carregar layouts
// Bug Fix: sort usa .getTime() para evitar NaN
// ============================================

import { v4 as uuidv4 } from 'uuid'
import type { SavedLayout, Appointment, AppointmentStatus, CanvasItem, ReferenceLayout } from '../types'
import { supabase, isSupabaseConfigured } from './supabase'

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
  const id = layoutData.id || uuidv4()
  const shareToken = layoutData.shareToken || `share_${uuidv4()}`
  const saved: SavedLayout = {
    ...(layoutData as SavedLayout),
    id,
    shareToken,
    layoutName: layoutData.layoutName || 'Layout sem nome',
    updatedAt: new Date().toISOString(),
    createdAt: layoutData.createdAt || new Date().toISOString(),
    thumbnail: layoutData.thumbnail ?? null,
  }

  try {
    const layouts = getLayouts()
    layouts[id] = saved
    localStorage.setItem(LAYOUTS_KEY, JSON.stringify(layouts))
    syncLayoutToSupabase(saved)
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
      syncLayoutToSupabase(saved)
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
        syncLayoutToSupabase(saved)
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
  deleteLayoutFromSupabase(id)
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
    const id = uuidv4()
    const saved: Appointment = {
      ...appointmentData,
      id,
      status: 'novo',
      createdAt: new Date().toISOString(),
    }
    appointments[id] = saved
    localStorage.setItem(APPOINTMENTS_KEY, JSON.stringify(appointments))
    syncAppointmentToSupabase(saved)
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
    syncAppointmentToSupabase(appointments[id])
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

export function getLayoutStats(layout: { storeWidth: number; storeHeight: number; items: CanvasItem[] } | null): LayoutStats | null {
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

// ─── Supabase Background Sync Helpers ──────────────────────────────────────────

function getValidUuid(id: string): string {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (uuidRegex.test(id)) {
    return id
  }
  return uuidv4()
}

export function syncLayoutToSupabase(layout: SavedLayout): void {
  if (!supabase || !isSupabaseConfigured) return
  
  const validId = getValidUuid(layout.id)
  if (validId !== layout.id) {
    const layouts = getLayouts()
    delete layouts[layout.id]
    layout.id = validId
    layouts[validId] = layout
    localStorage.setItem(LAYOUTS_KEY, JSON.stringify(layouts))
  }
  
  const dbData = {
    id: layout.id,
    layoutName: layout.layoutName || 'Layout sem nome',
    storeWidth: layout.storeWidth,
    storeHeight: layout.storeHeight,
    storeType: layout.storeType,
    layoutDensity: layout.layoutDensity || null,
    items: layout.items,
    shareToken: layout.shareToken,
    thumbnail: layout.thumbnail,
    createdAt: layout.createdAt,
    updatedAt: layout.updatedAt
  }

  Promise.resolve(
    supabase.from('layouts')
      .upsert(dbData)
  )
    .then(({ error }) => {
      if (error) {
        console.warn('⚠️ Erro ao sincronizar layout com o Supabase:', error.message)
      } else {
        console.log('✅ Layout sincronizado com o Supabase:', layout.id)
      }
    })
    .catch(err => {
      console.warn('⚠️ Falha de rede ao sincronizar layout:', err)
    })
}

export function deleteLayoutFromSupabase(id: string): void {
  if (!supabase || !isSupabaseConfigured) return

  Promise.resolve(
    supabase.from('layouts')
      .delete()
      .eq('id', id)
  )
    .then(({ error }) => {
      if (error) {
        console.warn('⚠️ Erro ao deletar layout no Supabase:', error.message)
      } else {
        console.log('✅ Layout deletado no Supabase:', id)
      }
    })
    .catch(err => {
      console.warn('⚠️ Falha de rede ao deletar layout no Supabase:', err)
    })
}

export function syncAppointmentToSupabase(appointment: Appointment): void {
  if (!supabase || !isSupabaseConfigured) return

  const validId = getValidUuid(appointment.id)
  if (validId !== appointment.id) {
    const appointments = getAppointments()
    delete appointments[appointment.id]
    appointment.id = validId
    appointments[validId] = appointment
    localStorage.setItem(APPOINTMENTS_KEY, JSON.stringify(appointments))
  }

  let dbLayoutId = null
  if (appointment.layoutId) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (uuidRegex.test(appointment.layoutId)) {
      dbLayoutId = appointment.layoutId
    }
  }

  const dbData = {
    id: appointment.id,
    name: appointment.name,
    email: appointment.email,
    phone: appointment.phone,
    city: appointment.city,
    storeType: appointment.storeType,
    storeArea: appointment.storeArea,
    date: appointment.date,
    time: appointment.time,
    notes: appointment.notes || null,
    layoutId: dbLayoutId,
    status: appointment.status,
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt || null
  }

  const isUpdate = !!appointment.updatedAt

  Promise.resolve(
    isUpdate
      ? supabase.from('appointments').upsert(dbData)
      : supabase.from('appointments').insert(dbData)
  )
    .then(({ error }) => {
      if (error) {
        console.warn('⚠️ Erro ao sincronizar agendamento com o Supabase:', error.message)
      } else {
        console.log('✅ Agendamento sincronizado com o Supabase:', appointment.id)
      }
    })
    .catch(err => {
      console.warn('⚠️ Falha de rede ao sincronizar agendamento:', err)
    })
}

export async function syncAllWithSupabase(): Promise<void> {
  if (!supabase || !isSupabaseConfigured) return

  console.log('🔄 Iniciando sincronização bidirecional com o Supabase...')
  try {
    // 1. Sincronizar Layouts
    const { data: remoteLayouts, error: layoutsErr } = await supabase.from('layouts').select('*')
    if (layoutsErr) {
      console.warn('⚠️ Não foi possível carregar os layouts do Supabase:', layoutsErr.message)
    } else if (remoteLayouts) {
      const localLayouts = getLayouts()
      let hasUpdates = false

      remoteLayouts.forEach((rl: any) => {
        const local = localLayouts[rl.id]
        if (!local || new Date(rl.updatedAt).getTime() > new Date(local.updatedAt).getTime()) {
          localLayouts[rl.id] = {
            id: rl.id,
            layoutName: rl.layoutName,
            storeWidth: Number(rl.storeWidth),
            storeHeight: Number(rl.storeHeight),
            storeType: rl.storeType,
            layoutDensity: rl.layoutDensity,
            items: rl.items,
            shareToken: rl.shareToken,
            thumbnail: rl.thumbnail,
            createdAt: rl.createdAt,
            updatedAt: rl.updatedAt,
            layoutId: rl.layoutId
          }
          hasUpdates = true
        }
      })

      Object.values(localLayouts).forEach(local => {
        const remote = remoteLayouts.find((r: any) => r.id === local.id)
        if (!remote || new Date(local.updatedAt).getTime() > new Date(remote.updatedAt).getTime()) {
          syncLayoutToSupabase(local)
        }
      })

      if (hasUpdates) {
        localStorage.setItem(LAYOUTS_KEY, JSON.stringify(localLayouts))
      }
    }

    // 2. Sincronizar Agendamentos (apenas se o usuário for administrador)
    let isAdmin = false
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
        isAdmin = profile?.role === 'admin'
      }
    } catch (e) {
      console.warn('Erro ao verificar permissão admin para sincronização de agendamentos:', e)
    }

    if (isAdmin) {
      const { data: remoteAppts, error: apptsErr } = await supabase.from('appointments').select('*')
      if (apptsErr) {
        console.warn('⚠️ Não foi possível carregar os agendamentos do Supabase:', apptsErr.message)
      } else if (remoteAppts) {
        const localAppts = getAppointments()
        let hasUpdates = false

        remoteAppts.forEach((ra: any) => {
          const local = localAppts[ra.id]
          if (!local || (ra.updatedAt && (!local.updatedAt || new Date(ra.updatedAt).getTime() > new Date(local.updatedAt).getTime()))) {
            localAppts[ra.id] = {
              id: ra.id,
              name: ra.name,
              email: ra.email,
              phone: ra.phone,
              city: ra.city,
              storeType: ra.storeType,
              storeArea: ra.storeArea,
              date: ra.date,
              time: ra.time,
              notes: ra.notes,
              layoutId: ra.layoutId,
              status: ra.status,
              createdAt: ra.createdAt,
              updatedAt: ra.updatedAt
            }
            hasUpdates = true
          }
        })

        Object.values(localAppts).forEach(local => {
          const remote = remoteAppts.find((r: any) => r.id === local.id)
          if (!remote || (local.updatedAt && (!remote.updatedAt || new Date(local.updatedAt).getTime() > new Date(remote.updatedAt).getTime()))) {
            syncAppointmentToSupabase(local)
          }
        })

        if (hasUpdates) {
          localStorage.setItem(APPOINTMENTS_KEY, JSON.stringify(localAppts))
        }
      }
    }

    // 3. Sincronizar Layouts de Referência
    const { data: remoteRefLayouts, error: refLayoutsErr } = await supabase.from('reference_layouts').select('*')
    if (refLayoutsErr) {
      console.warn('⚠️ Não foi possível carregar os layouts de referência do Supabase:', refLayoutsErr.message)
    } else if (remoteRefLayouts) {
      let localRefLayouts: ReferenceLayout[] = []
      const REFERENCE_LAYOUTS_KEY = 'projefarma_reference_layouts'
      try {
        const raw = localStorage.getItem(REFERENCE_LAYOUTS_KEY)
        localRefLayouts = raw ? (JSON.parse(raw) as ReferenceLayout[]) : []
      } catch {
        localRefLayouts = []
      }

      let hasRefUpdates = false

      remoteRefLayouts.forEach((rl: any) => {
        const localIndex = localRefLayouts.findIndex(l => l.id === rl.id)
        if (localIndex === -1) {
          localRefLayouts.push({
            id: rl.id,
            name: rl.name,
            storeType: rl.storeType,
            storeWidth: Number(rl.storeWidth),
            storeHeight: Number(rl.storeHeight),
            items: rl.items,
            sourceImageBase64: rl.sourceImageBase64 || undefined,
            approved: rl.approved,
            createdAt: rl.createdAt,
            updatedAt: rl.updatedAt,
          })
          hasRefUpdates = true
        } else {
          const local = localRefLayouts[localIndex]
          if (new Date(rl.updatedAt).getTime() > new Date(local.updatedAt).getTime()) {
            localRefLayouts[localIndex] = {
              id: rl.id,
              name: rl.name,
              storeType: rl.storeType,
              storeWidth: Number(rl.storeWidth),
              storeHeight: Number(rl.storeHeight),
              items: rl.items,
              sourceImageBase64: rl.sourceImageBase64 || undefined,
              approved: rl.approved,
              createdAt: rl.createdAt,
              updatedAt: rl.updatedAt,
            }
            hasRefUpdates = true
          }
        }
      })

      localRefLayouts.forEach(local => {
        const remote = remoteRefLayouts.find((r: any) => r.id === local.id)
        if (!remote || new Date(local.updatedAt).getTime() > new Date(remote.updatedAt).getTime()) {
          const dbData = {
            id: local.id,
            name: local.name,
            storeType: local.storeType,
            storeWidth: local.storeWidth,
            storeHeight: local.storeHeight,
            items: local.items,
            sourceImageBase64: local.sourceImageBase64 || null,
            approved: local.approved,
            createdAt: local.createdAt,
            updatedAt: local.updatedAt,
          }
          supabase!.from('reference_layouts').upsert(dbData).then(({ error }) => {
            if (error) console.warn('⚠️ Erro ao sincronizar local → remoto de referência:', error.message)
          })
        }
      })

      if (hasRefUpdates) {
        localStorage.setItem(REFERENCE_LAYOUTS_KEY, JSON.stringify(localRefLayouts))
      }
    }

    console.log('✅ Sincronização com o Supabase concluída.')
  } catch (err) {
    console.warn('⚠️ Falha crítica ao rodar sincronização com o Supabase:', err)
  }
}
