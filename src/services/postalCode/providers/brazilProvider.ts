// ============================================================
// Brazil Provider — Consulta via ViaCEP
// ============================================================

import type { PostalCodeProvider, ProviderResult } from '../types'

/** Resposta da API ViaCEP */
interface ViaCepResponse {
  cep: string
  logradouro: string
  complemento: string
  unidade: string
  bairro: string
  localidade: string
  uf: string
  estado: string
  regiao: string
  ibge: string
  gia: string
  ddd: string
  siafi: string
  erro?: boolean
}

export const brazilProvider: PostalCodeProvider = {
  countryCode: 'BR',
  postalCodeLength: 8,
  placeholder: '00000-000',

  sanitize(value: string): string {
    return value.replace(/\D/g, '')
  },

  formatMask(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 8)
    if (digits.length <= 5) return digits
    return `${digits.slice(0, 5)}-${digits.slice(5)}`
  },

  isComplete(value: string): boolean {
    return this.sanitize(value).length === 8
  },

  async lookup(postalCode: string): Promise<ProviderResult> {
    const digits = this.sanitize(postalCode)

    if (digits.length !== 8) {
      return { success: false, error: 'CEP deve conter 8 dígitos.' }
    }

    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
        signal: AbortSignal.timeout(8000),
      })

      if (!response.ok) {
        return { success: false, error: 'Erro ao consultar o CEP. Tente novamente.' }
      }

      const data: ViaCepResponse = await response.json()

      if (data.erro) {
        return { success: false, error: 'CEP não encontrado.' }
      }

      return {
        success: true,
        data: {
          country: 'BR',
          city: data.localidade,
          state: data.uf,
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
