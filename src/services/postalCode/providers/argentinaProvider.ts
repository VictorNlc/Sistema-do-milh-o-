// ============================================================
// Argentina Provider — Consulta via Zippopotam.us
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

export const argentinaProvider: PostalCodeProvider = {
  countryCode: 'AR',
  postalCodeLength: 4,
  placeholder: '0000',

  sanitize(value: string): string {
    return value.replace(/\D/g, '')
  },

  formatMask(value: string): string {
    return value.replace(/\D/g, '').slice(0, 4)
  },

  isComplete(value: string): boolean {
    return this.sanitize(value).length === 4
  },

  async lookup(postalCode: string): Promise<ProviderResult> {
    const digits = this.sanitize(postalCode)

    if (digits.length !== 4) {
      return { success: false, error: 'Código postal deve conter 4 dígitos.' }
    }

    try {
      const response = await fetch(`https://api.zippopotam.us/AR/${digits}`, {
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
  },
}
