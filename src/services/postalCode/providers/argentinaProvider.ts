// ============================================================
// Argentina Provider — Consulta via Zippopotam.us
// Supporting numeric (4 digits) and CPA (8 chars) formats
// ============================================================

import type { PostalCodeProvider, ProviderResult } from '../types'

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

/**
  * Remove espaços em branco e converte letras para maiúsculas.
  * Valida ambos os formatos e retorna o valor normalizado.
  */
export function normalizeArgentinaPostalCode(code: string): string {
  const normalized = code.replace(/\s+/g, '').toUpperCase()
  const isValid = /^\d{4}$/.test(normalized) || /^[A-Z]\d{4}[A-Z]{3}$/.test(normalized)
  if (!isValid) {
    throw new Error('Formato de código postal argentino inválido.')
  }
  return normalized
}

async function fetchFromZippopotam(code: string): Promise<ProviderResult> {
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

export const argentinaProvider: PostalCodeProvider = {
  countryCode: 'AR',
  postalCodeLength: 4, // default fallback length
  placeholder: 'Ex: 7600 ou C1043AAZ',

  sanitize(value: string): string {
    return value.replace(/\s+/g, '').toUpperCase()
  },

  formatMask(value: string): string {
    return this.sanitize(value).slice(0, 8)
  },

  isComplete(value: string): boolean {
    const sanitized = this.sanitize(value)
    return /^\d{4}$/.test(sanitized) || /^[A-Z]\d{4}[A-Z]{3}$/.test(sanitized)
  },

  async lookup(postalCode: string): Promise<ProviderResult> {
    let sanitized: string
    try {
      sanitized = normalizeArgentinaPostalCode(postalCode)
    } catch {
      return { success: false, error: 'Informe um código postal argentino válido. Exemplos: 7600 ou C1043AAZ' }
    }

    const isNumeric = /^\d{4}$/.test(sanitized)

    if (isNumeric) {
      return fetchFromZippopotam(sanitized)
    }

    // CPA format (8 characters). Try complete code first.
    const firstAttempt = await fetchFromZippopotam(sanitized)
    if (firstAttempt.success) {
      return firstAttempt
    }

    // Failover: extract the 4 numeric digits from CPA (e.g. C1043AAZ -> 1043)
    const numericPart = sanitized.substring(1, 5)
    if (numericPart && /^\d{4}$/.test(numericPart)) {
      return fetchFromZippopotam(numericPart)
    }

    return firstAttempt
  },
}
