// ============================================================
// Uruguay Provider — Consulta via IDE Uruguay (direcciones.ide.uy)
// ============================================================

import type { PostalCodeProvider, ProviderResult } from '../types'

/** Resposta de localidade da IDE Uruguay */
interface IdeLocalidad {
  id: number
  nombre: string
  codigoPostal: number
  alias: string | null
}

/** Departamentos do Uruguai */
const DEPARTAMENTOS = [
  'Artigas', 'Canelones', 'Cerro Largo', 'Colonia', 'Durazno',
  'Flores', 'Florida', 'Lavalleja', 'Maldonado', 'Montevideo',
  'Paysandú', 'Río Negro', 'Rivera', 'Rocha', 'Salto',
  'San José', 'Soriano', 'Tacuarembó', 'Treinta y Tres',
]

/** Cache em memória: código postal → { localidade, departamento } */
let postalCodeCache: Map<number, { localidad: string; departamento: string }> | null = null
let cachePromise: Promise<void> | null = null

/**
 * Carrega todas as localidades de todos os departamentos e constrói o cache.
 * Executado apenas uma vez.
 */
async function loadCache(): Promise<void> {
  if (postalCodeCache) return
  if (cachePromise) return cachePromise

  cachePromise = (async () => {
    const cache = new Map<number, { localidad: string; departamento: string }>()

    // Buscar localidades de cada departamento em paralelo
    const results = await Promise.allSettled(
      DEPARTAMENTOS.map(async (depto) => {
        try {
          const response = await fetch(
            `https://direcciones.ide.uy/api/v0/geocode/localidades?departamento=${encodeURIComponent(depto)}`,
            { signal: AbortSignal.timeout(10000) }
          )

          if (!response.ok) {
            console.warn(`[UY Provider] Falha ao carregar departamento ${depto}: HTTP ${response.status}`)
            return
          }

          const localidades: IdeLocalidad[] = await response.json()

          if (!Array.isArray(localidades)) {
            console.warn(`[UY Provider] Resposta inesperada para ${depto}:`, localidades)
            return
          }

          for (const loc of localidades) {
            if (loc.codigoPostal && loc.codigoPostal > 0) {
              // Se já existe no cache, mantém o primeiro (geralmente mais relevante)
              if (!cache.has(loc.codigoPostal)) {
                cache.set(loc.codigoPostal, {
                  localidad: loc.nombre,
                  departamento: depto,
                })
              }
            }
          }
        } catch (err) {
          console.warn(`[UY Provider] Erro ao buscar departamento ${depto}:`, err)
        }
      })
    )

    // Log de resultados para depuração
    const fulfilled = results.filter(r => r.status === 'fulfilled').length
    console.info(`[UY Provider] Cache carregado: ${cache.size} códigos postais de ${fulfilled}/${DEPARTAMENTOS.length} departamentos`)

    postalCodeCache = cache
    cachePromise = null
  })()

  return cachePromise
}

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

    try {
      await loadCache()
    } catch {
      return { success: false, error: 'Serviço temporariamente indisponível. Tente novamente.' }
    }

    if (!postalCodeCache) {
      return { success: false, error: 'Serviço temporariamente indisponível. Tente novamente.' }
    }

    const code = parseInt(digits, 10)
    const entry = postalCodeCache.get(code)

    if (!entry) {
      return { success: false, error: 'Código postal não encontrado.' }
    }

    return {
      success: true,
      data: {
        country: 'UY',
        city: entry.localidad,
        state: entry.departamento,
      },
    }
  },
}
