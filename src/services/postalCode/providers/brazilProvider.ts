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

    // ── 1. ViaCEP ───────────────────────────────────────────────────────────

    let viaCepFailed = false

    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
        signal: AbortSignal.timeout(8000),
      })

      if (!response.ok) {
        viaCepFailed = true
      } else {
        const data: ViaCepResponse = await response.json()
        if (data.erro || !data.localidade || !data.uf) {
          viaCepFailed = true
        } else {
          return {
            success: true,
            data: {
              country: 'BR',
              city: data.localidade,
              state: data.uf,
            },
          }
        }
      }
    } catch (err) {
      viaCepFailed = true
    }

    if (viaCepFailed) {


      // ── 2. BrasilAPI ───────────────────────────────────────────────────────

      let brasilApiFailed = false

      try {
        const response = await fetch(`https://brasilapi.com.br/api/cep/v1/${digits}`, {
          signal: AbortSignal.timeout(8000),
        })

        if (!response.ok) {
          brasilApiFailed = true
        } else {
          interface BrasilApiResponse {
            cep: string
            state: string
            city: string
            neighborhood?: string
            street?: string
          }

          const data: BrasilApiResponse = await response.json()

          if (!data.city || !data.state) {
            brasilApiFailed = true
          } else {
            return {
              success: true,
              data: {
                country: 'BR',
                city: data.city,
                state: data.state,
              },
            }
          }
        }
      } catch (err) {
        brasilApiFailed = true
      }

      if (brasilApiFailed) {


        // ── 3. OpenCEP ───────────────────────────────────────────────────────


        try {
          const response = await fetch(`https://opencep.com/v1/${digits}`, {
            signal: AbortSignal.timeout(8000),
          })

          if (response.ok) {
            interface OpenCepResponse {
              cep: string
              uf?: string
              localidade?: string
              state?: string
              city?: string
            }

            const data: OpenCepResponse = await response.json()
            const state = data.uf || data.state
            const city = data.localidade || data.city

            if (city && state) {

              return {
                success: true,
                data: {
                  country: 'BR',
                  city,
                  state,
                },
              }
            }
          }
        } catch (err) {
          // ignore error to return standardized failure
        }
      }
    }

    return { success: false, error: 'Não foi possível localizar este CEP.' }
  },
}
