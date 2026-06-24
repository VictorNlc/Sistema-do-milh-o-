// ============================================================
// Argentina Provider — Consulta via Zippopotam.us
// Fallback: RapidAPI Argentina CPA
// Supporting numeric (4 digits) and CPA (8 chars) formats
// ============================================================

import type { PostalCodeProvider, ProviderResult } from '../types'

// ── Zippopotam types ────────────────────────────────────────

/** Resposta da API Zippopotam.us */
interface ZippopotamPlace {
  'place name': string
  longitude: string
  latitude: string
  state: string
  'state abbreviation': string
}

interface ZippopotamResponse {
  country: string
  'country abbreviation': string
  'post code': string
  places: ZippopotamPlace[]
}

// ── RapidAPI CPA types ──────────────────────────────────────

/** Resposta da API RapidAPI Argentina CPA (validate_cpa) */
interface RapidApiCpaResponse {
  localidad?: string
  provincia?: string
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
  * Valida ambos os formatos e retorna o valor normalizado.
  */
export function normalizeArgentinaPostalCode(code: string): string {
  const normalized = code.replace(/\s+/g, '').toUpperCase()
  const isValid = /^[A-Z]\d{4}[A-Z]{3}$/.test(normalized)
  if (!isValid) {
    throw new Error('Formato de código postal argentino inválido. Ex: C1043AAZ')
  }
  return normalized
}

/** Verifica se o código está no formato CPA completo (ex: C1043AAZ) */
function isCpaFormat(code: string): boolean {
  return /^[A-Z]\d{4}[A-Z]{3}$/.test(code)
}

// ── Zippopotam lookup ───────────────────────────────────────

async function fetchFromZippopotam(code: string): Promise<ProviderResult> {
  console.log('[AR] Consultando Zippopotam...')
  try {
    const response = await fetch(`https://api.zippopotam.us/AR/${code}`, {
      signal: AbortSignal.timeout(8000),
    })

    if (response.status === 404) {
      return { success: false, error: 'Código postal não encontrado.' }
    }

    if (!response.ok) {
      return { success: false, error: 'Erro ao consultar código postal. Tente novamente.' }
    }

    const data: ZippopotamResponse = await response.json()

    if (!data.places || data.places.length === 0) {
      return { success: false, error: 'Código postal não encontrado.' }
    }

    const place = data.places[0]

    return {
      success: true,
      data: {
        country: 'AR',
        city: place['place name'],
        state: place.state,
      },
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      return { success: false, error: 'Tempo de resposta esgotado. Tente novamente.' }
    }
    return { success: false, error: 'Erro de conexão. Verifique sua internet e tente novamente.' }
  }
}

// ── RapidAPI CPA fallback ───────────────────────────────────

/**
 * Consulta a API RapidAPI Argentina CPA como fallback.
 * Utiliza o endpoint validate_cpa para buscar localidade e província
 * a partir do código CPA completo.
 *
 * @param cpa - Código CPA no formato completo (ex: C1043AAZ)
 * @returns ProviderResult com cidade e província ou erro
 */
async function lookupArgentinaCPA(cpa: string): Promise<ProviderResult> {
  const apiKey = import.meta.env.VITE_ARGENTINA_CPA_API_KEY

  // ── AUDITORIA: Etapa 2 — Verificar CPA recebido ──────────
  console.log('[AR] CPA recebido:', cpa)
  console.log('[AR] CPA typeof:', typeof cpa)
  console.log('[AR] CPA length:', cpa.length)

  if (!apiKey) {
    console.warn('[AR] Chave da API RapidAPI CPA não configurada (VITE_ARGENTINA_CPA_API_KEY).')
    return {
      success: false,
      error: 'Chave da API de fallback não configurada.',
    }
  }

  // ── AUDITORIA: Verificar se a chave está presente ─────────
  console.log('[AR] API Key presente:', apiKey ? `${apiKey.substring(0, 8)}...` : 'VAZIA')

  try {
    const url = `${RAPIDAPI_CPA_BASE_URL}?cpa=${encodeURIComponent(cpa)}`

    const headers = {
      'x-rapidapi-key': apiKey,
      'x-rapidapi-host': RAPIDAPI_CPA_HOST,
      'Content-Type': 'application/json',
    }

    // ── AUDITORIA: Etapa 1 — Verificar URL ──────────────────
    console.log('[AR] URL utilizada:', url)

    // ── AUDITORIA: Etapa 3 — Verificar headers ──────────────
    console.log('[AR] Headers enviados:', {
      'x-rapidapi-key': `${apiKey.substring(0, 8)}...`,
      'x-rapidapi-host': headers['x-rapidapi-host'],
      'Content-Type': headers['Content-Type'],
    })

    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000),
    })

    // ── AUDITORIA: Etapa 4 — Status e Content-Type ──────────
    console.log('[AR] Status:', response.status)
    console.log('[AR] Content-Type:', response.headers.get('content-type'))

    if (response.status === 404) {
      return { success: false, error: 'Código CPA não encontrado na API de fallback.' }
    }

    if (!response.ok) {
      console.error(`[AR] RapidAPI CPA — Erro HTTP: ${response.status}`)
      return { success: false, error: 'Erro ao consultar API de fallback.' }
    }

    // ── AUDITORIA: Etapa 5 — Resposta bruta (text) ──────────
    const rawResult = await response.text()
    console.log('[AR] Resposta bruta:', rawResult)

    // ── AUDITORIA: Etapa 6 — Tipo da resposta ───────────────
    console.log('[AR] Estrutura identificada:', typeof rawResult)

    // Tentar parsear como JSON
    let parsedResult: unknown
    try {
      parsedResult = JSON.parse(rawResult)
    } catch (parseErr) {
      console.error('[AR] Falha ao parsear JSON:', parseErr)
      console.error('[AR] Conteúdo bruto que falhou no parse:', rawResult)
      return { success: false, error: 'Resposta inválida da API de fallback.' }
    }

    // ── AUDITORIA: Etapa 7 — Estrutura completa ─────────────
    console.log('[AR] Parsed result type:', typeof parsedResult)
    console.log('[AR] Parsed result isArray:', Array.isArray(parsedResult))
    console.dir(parsedResult, { depth: null })

    // A API pode retornar um array ou um objeto único
    const record: RapidApiCpaResponse | undefined = Array.isArray(parsedResult)
      ? (parsedResult[0] as RapidApiCpaResponse | undefined)
      : (parsedResult as RapidApiCpaResponse)

    if (!record) {
      console.warn('[AR] Record é undefined/null após extração.')
      return { success: false, error: 'Código CPA não encontrado na API de fallback.' }
    }

    // ── AUDITORIA: Listar todas as chaves do record ─────────
    console.log('[AR] Chaves do record:', Object.keys(record))
    console.log('[AR] Valores do record:', record)

    const city = record.localidad ?? ''
    const state = (record.province as { nombre?: string })?.nombre ?? ''

    console.log('[AR] city (localidad):', JSON.stringify(city))
    console.log('[AR] state (province.nombre):', JSON.stringify(state))

    if (!state) {
      console.warn('[AR] State está vazio (province.nombre null/undefined).')
      return { success: false, error: 'Código CPA não encontrado na API de fallback.' }
    }

    console.log('[AR] Resultado encontrado via RapidAPI CPA.')

    // ── AUDITORIA: Etapa 8 — Resultado final ────────────────
    const mappedResult = {
      country: 'AR',
      city,
      state,
    }
    console.log('[AR] Resultado final:', mappedResult)

    return {
      success: true,
      data: mappedResult,
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      console.error('[AR] Timeout na consulta RapidAPI CPA.')
      return { success: false, error: 'Tempo de resposta esgotado na API de fallback.' }
    }
    console.error('[AR] Erro de rede na consulta RapidAPI CPA:', err)
    return { success: false, error: 'Erro de conexão na API de fallback.' }
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
    // ── AUDITORIA: Log de entrada ───────────────────────────
    console.log('[AR] ═══════════════════════════════════════════')
    console.log('[AR] lookup() chamado com postalCode:', JSON.stringify(postalCode))

    let sanitized: string
    try {
      sanitized = normalizeArgentinaPostalCode(postalCode)
    } catch {
      return { success: false, error: 'Informe um código postal argentino válido. Exemplo: C1043AAZ' }
    }

    console.log('[AR] Código normalizado:', sanitized)

    // ── Etapa 1: Consultar Zippopotam ───────────────────────

    // CPA format (8 characters). Try complete code first.
    console.log('[AR] Tentando Zippopotam com CPA completo:', sanitized)
    const firstAttempt = await fetchFromZippopotam(sanitized)
    console.log('[AR] Zippopotam resultado (CPA completo):', firstAttempt)

    if (firstAttempt.success) {
      return firstAttempt
    }

    // ── Etapa 2: Fallback RapidAPI CPA ──────────────────────

    console.warn('[AR] Zippopotam sem resultado. Iniciando fallback CPA.')
    const cpaResult = await lookupArgentinaCPA(sanitized)
    console.log('[AR] RapidAPI CPA resultado:', cpaResult)

    if (cpaResult.success) {
      return cpaResult
    }

    // Ambas as APIs falharam
    console.error('[AR] Nenhum resultado encontrado para o código informado.')
    return firstAttempt
  },
}
