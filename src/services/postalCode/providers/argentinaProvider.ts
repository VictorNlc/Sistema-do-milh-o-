// ============================================================
// Argentina Provider — Consulta via RapidAPI Argentina CPA
// Supporting CPA (8 chars) format
// ============================================================

import type { PostalCodeProvider, ProviderResult } from '../types'

// ── RapidAPI CPA types ──────────────────────────────────────

/** Resposta da API RapidAPI Argentina CPA (validate_cpa) */
interface RapidApiCpaResponse {
  localidad?: string | { nombre?: string; name?: string }
  provincia?: string | { nombre?: string; name?: string }
  province?: string | { nombre?: string; name?: string }
  cpa?: string
  codigo_postal?: string
  [key: string]: unknown
}

// ── Constants ───────────────────────────────────────────────

const RAPIDAPI_CPA_HOST = 'argentina-cpa-codigo-postal-argentino.p.rapidapi.com'
const RAPIDAPI_CPA_BASE_URL = `https://${RAPIDAPI_CPA_HOST}/localidades/validate_cpa`

// ── Helpers ─────────────────────────────────────────────────

/**
  * Remove espaços em branco e converte letras para maiúsculas.
  * Valida o formato CPA e retorna o valor normalizado.
  */
export function normalizeArgentinaPostalCode(code: string): string {
  const normalized = code.replace(/\s+/g, '').toUpperCase()
  const isValid = /^[A-Z]\d{4}[A-Z]{3}$/.test(normalized)
  if (!isValid) {
    throw new Error('Formato de código postal argentino inválido. Ex: C1043AAZ')
  }
  return normalized
}

/**
 * Consulta a API RapidAPI Argentina CPA.
 * Utiliza o endpoint validate_cpa para buscar localidade e província
 * a partir do código CPA completo.
 *
 * @param cpa - Código CPA no formato completo (ex: C1043AAZ)
 * @returns ProviderResult com cidade e província ou erro
 */
async function lookupArgentinaCPA(cpa: string): Promise<ProviderResult> {
  const apiKey = import.meta.env.VITE_ARGENTINA_CPA_API_KEY





  if (!apiKey) {
    console.warn('[AR] Chave da API RapidAPI CPA não configurada (VITE_ARGENTINA_CPA_API_KEY).')
    return {
      success: false,
      error: 'Não foi possível localizar este CPA automaticamente. Informe sua cidade e província para continuar.',
    }
  }



  try {
    const url = `${RAPIDAPI_CPA_BASE_URL}?cpa=${encodeURIComponent(cpa)}`

    const headers = {
      'x-rapidapi-key': apiKey,
      'x-rapidapi-host': RAPIDAPI_CPA_HOST,
      'Content-Type': 'application/json',
    }




    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000),
    })




    if (response.status === 404) {
      return { success: false, error: 'Não foi possível localizar este CPA automaticamente. Informe sua cidade e província para continuar.' }
    }

    if (!response.ok) {
      console.error(`[AR] RapidAPI CPA — Erro HTTP: ${response.status}`)
      return { success: false, error: 'Não foi possível localizar este CPA automaticamente. Informe sua cidade e província para continuar.' }
    }

    const rawResult = await response.text()



    // Tentar parsear como JSON
    let parsedResult: unknown
    try {
      parsedResult = JSON.parse(rawResult)
    } catch (parseErr) {
      console.error('[AR] Falha ao parsear JSON:', parseErr)
      console.error('[AR] Conteúdo bruto que falhou no parse:', rawResult)
      return { success: false, error: 'Não foi possível localizar este CPA automaticamente. Informe sua cidade e província para continuar.' }
    }


    console.dir(parsedResult, { depth: null })

    // A API pode retornar um array ou um objeto único
    const record: RapidApiCpaResponse | undefined = Array.isArray(parsedResult)
      ? (parsedResult[0] as RapidApiCpaResponse | undefined)
      : (parsedResult as RapidApiCpaResponse)

    if (!record) {
      console.warn('[AR] Record é undefined/null após extração.')
      return { success: false, error: 'Não foi possível localizar este CPA automaticamente. Informe sua cidade e província para continuar.' }
    }




    // Extração robusta de cidade (localidad.nombre)
    let city = ''
    if (record.localidad) {
      if (typeof record.localidad === 'object' && record.localidad !== null) {
        city = (record.localidad as { nombre?: string; name?: string }).nombre || 
               (record.localidad as { nombre?: string; name?: string }).name || ''
      } else if (typeof record.localidad === 'string') {
        city = record.localidad
      }
    }
    city = city.trim()

    // Extração robusta de estado/província (province)
    let state = ''
    if (record.province) {
      if (typeof record.province === 'object' && record.province !== null) {
        state = (record.province as { nombre?: string; name?: string }).nombre || 
                (record.province as { nombre?: string; name?: string }).name || ''
      } else if (typeof record.province === 'string') {
        state = record.province
      }
    } else if (record.provincia) {
      if (typeof record.provincia === 'object' && record.provincia !== null) {
        state = (record.provincia as { nombre?: string; name?: string }).nombre || 
                (record.provincia as { nombre?: string; name?: string }).name || ''
      } else if (typeof record.provincia === 'string') {
        state = record.provincia
      }
    }
    state = state.trim()




    if (!state) {
      console.warn('[AR] State/province está vazio.')
      return { success: false, error: 'Não foi possível localizar este CPA automaticamente. Informe sua cidade e província para continuar.' }
    }



    const mappedResult = {
      country: 'AR',
      city,
      state,
    }


    return {
      success: true,
      data: mappedResult,
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      console.error('[AR] Timeout na consulta RapidAPI CPA.')
    } else {
      console.error('[AR] Erro de rede na consulta RapidAPI CPA:', err)
    }
    return { success: false, error: 'Não foi possível localizar este CPA automaticamente. Informe sua cidade e província para continuar.' }
  }
}

// ── Provider ────────────────────────────────────────────────

export const argentinaProvider: PostalCodeProvider = {
  countryCode: 'AR',
  postalCodeLength: 8, // CPA length
  placeholder: 'Ex: C1043AAZ',

  sanitize(value: string): string {
    return value.replace(/\s+/g, '').toUpperCase()
  },

  formatMask(value: string): string {
    return this.sanitize(value).slice(0, 8)
  },

  isComplete(value: string): boolean {
    const sanitized = this.sanitize(value)
    return /^[A-Z]\d{4}[A-Z]{3}$/.test(sanitized)
  },

  async lookup(postalCode: string): Promise<ProviderResult> {


    let sanitized: string
    try {
      sanitized = normalizeArgentinaPostalCode(postalCode)
    } catch {
      return { success: false, error: 'Informe um código postal argentino válido. Exemplo: C1043AAZ' }
    }




    return lookupArgentinaCPA(sanitized)
  },
}

// ── Cache for Argentina Georef API ──────────────────────────

export interface ArgentinaProvince {
  id: string
  nombre: string
}

export interface ArgentinaMunicipio {
  id: string
  nombre: string
}

let provincesCache: ArgentinaProvince[] | null = null
const municipiosCache: Record<string, ArgentinaMunicipio[]> = {}

export async function getArgentinaProvinces(): Promise<ArgentinaProvince[]> {
  if (provincesCache) return provincesCache

  try {
    const response = await fetch('https://apis.datos.gob.ar/georef/api/provincias', {
      signal: AbortSignal.timeout(8000)
    })
    if (!response.ok) throw new Error('Falha ao carregar províncias da Argentina')
    const data = await response.json()
    const list: ArgentinaProvince[] = (data.provincias || []).map((p: any) => ({
      id: p.id,
      nombre: p.nombre
    }))
    list.sort((a, b) => a.nombre.localeCompare(b.nombre))
    provincesCache = list
    return list
  } catch (err) {
    console.error('[AR Provider] Erro ao carregar províncias:', err)
    throw new Error('Não foi possível carregar a lista de províncias.')
  }
}

export async function getArgentinaCities(provinceId: string): Promise<ArgentinaMunicipio[]> {
  if (municipiosCache[provinceId]) return municipiosCache[provinceId]

  try {
    const url = `https://apis.datos.gob.ar/georef/api/municipios?provincia=${encodeURIComponent(provinceId)}&campos=id,nombre&max=100`
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000)
    })
    if (!response.ok) throw new Error('Falha ao carregar municípios da Argentina')
    const data = await response.json()
    const list: ArgentinaMunicipio[] = (data.municipios || []).map((m: any) => ({
      id: m.id,
      nombre: m.nombre
    }))
    list.sort((a, b) => a.nombre.localeCompare(b.nombre))
    municipiosCache[provinceId] = list
    return list
  } catch (err) {
    console.error(`[AR Provider] Erro ao carregar municípios para província ${provinceId}:`, err)
    throw new Error('Não foi possível carregar as cidades desta província.')
  }
}

