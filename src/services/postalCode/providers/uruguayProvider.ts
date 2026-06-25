// ============================================================
// Uruguay Provider — Consulta local via base UY_POSTCODES
// ============================================================

import type { PostalCodeProvider, ProviderResult } from '../types'
import { URUGUAY_POSTCODES } from '../../../data/uyPostcodes'

export const uruguayProvider: PostalCodeProvider = {
  countryCode: 'UY',
  postalCodeLength: 5,
  placeholder: '00000',

  sanitize(value: string): string {
    return value.replace(/\D/g, '')
  },

  formatMask(value: string): string {
    return value.replace(/\D/g, '').slice(0, 5)
  },

  isComplete(value: string): boolean {
    return this.sanitize(value).length === 5
  },

  async lookup(postalCode: string): Promise<ProviderResult> {
    const digits = this.sanitize(postalCode)

    if (digits.length !== 5) {
      return { success: false, error: 'Código postal deve conter 5 dígitos.' }
    }

    const entry = URUGUAY_POSTCODES[digits]

    if (!entry) {
      return { success: false, error: 'Código postal não encontrado na base do Uruguai.' }
    }

    return {
      success: true,
      data: {
        country: 'UY',
        city: entry.city,
        state: entry.department,
      },
    }
  },
}
