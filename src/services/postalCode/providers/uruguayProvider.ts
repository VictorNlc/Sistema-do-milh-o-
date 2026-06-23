// ============================================================
// Uruguay Provider — Consulta via IDE Uruguay com fallback CSV
// ============================================================

import type { PostalCodeProvider, ProviderResult, PostalLookupResult } from '../types'

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

/** Cache em memória para API: código postal → { localidade, departamento } */
let postalCodeCache: Map<number, { localidad: string; departamento: string }> | null = null
let cachePromise: Promise<void> | null = null

/** Registro do CSV de zonas postais do Uruguai */
interface UruguayPostalRecord {
  department: string
  locality: string
  postalCode: string
}

/** Cache em memória para CSV: código postal → UruguayPostalRecord */
let uruguayCsvMap: Map<string, UruguayPostalRecord> | null = null

/**
 * Carrega todas as localidades de todos os departamentos e constrói o cache da API.
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

/**
 * Carrega e parseia o CSV de fallback do Uruguai.
 * Executado apenas uma vez.
 */
async function loadUruguayCsv(): Promise<Map<string, UruguayPostalRecord>> {
  if (uruguayCsvMap) return uruguayCsvMap

  try {
    // Import dinâmico com ?raw — Vite retorna o conteúdo como string
    const csvModule = await import('../../../data/ZONA_POSTAL_URUGUAI.csv?raw')
    const csvText: string = csvModule.default

    const map = new Map<string, UruguayPostalRecord>()
    const lines = csvText.split('\n')

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      const columns = line.split(';')
      if (columns.length < 3) continue

      const depto = columns[0]?.trim() || ''
      const localidad = columns[1]?.trim() || ''
      const codPost = columns[2]?.trim() || ''

      if (!codPost || !depto) continue

      const normalizedCode = codPost.replace(/\D/g, '').padStart(5, '0')

      if (map.has(normalizedCode)) {
        console.warn(`[UY Provider] Código postal duplicado no CSV: ${normalizedCode}. Mantendo o primeiro (${map.get(normalizedCode)?.locality}).`)
      } else {
        map.set(normalizedCode, {
          department: depto,
          locality: localidad,
          postalCode: normalizedCode,
        })
      }
    }

    uruguayCsvMap = map
    return map
  } catch (err) {
    console.error('[UY Provider] Erro ao carregar CSV do Uruguai:', err)
    throw new Error('Falha ao carregar dados locais do Uruguai.')
  }
}

/**
 * Realiza consulta utilizando a API oficial.
 */
export async function lookupUruguayApi(postalCode: string): Promise<PostalLookupResult | null> {
  await loadCache()

  if (!postalCodeCache) {
    return null
  }

  const code = parseInt(postalCode, 10)
  const entry = postalCodeCache.get(code)

  if (!entry) {
    return null
  }

  return {
    country: 'UY',
    city: entry.localidad,
    state: entry.departamento,
  }
}

/**
 * Realiza consulta utilizando o arquivo CSV local como fallback.
 */
export async function lookupUruguayCsv(postalCode: string): Promise<PostalLookupResult | null> {
  const map = await loadUruguayCsv()
  const searchCode = postalCode.replace(/\D/g, '').padStart(5, '0')
  const entry = map.get(searchCode)

  if (!entry) {
    return null
  }

  return {
    country: 'UY',
    city: entry.locality,
    state: entry.department,
  }
}

/**
 * Função dedicada com estratégia de fallback para código postal do Uruguai.
 */
export async function lookupUruguayPostalCode(postalCode: string): Promise<PostalLookupResult | null> {
  console.log('[UY] Tentando consulta via API...')
  try {
    const apiResult = await lookupUruguayApi(postalCode)
    if (apiResult) {
      return apiResult
    }
    console.log('[UY] API sem resultado, iniciando fallback CSV...')
    const csvResult = await lookupUruguayCsv(postalCode)
    if (csvResult) {
      console.log('[UY] Resultado encontrado via CSV.')
    }
    return csvResult
  } catch (error) {
    console.log('[UY] API sem resultado, iniciando fallback CSV...')
    const csvResult = await lookupUruguayCsv(postalCode)
    if (csvResult) {
      console.log('[UY] Resultado encontrado via CSV.')
    }
    return csvResult
  }
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
      const data = await lookupUruguayPostalCode(digits)
      if (!data) {
        return { success: false, error: 'Código postal não encontrado.' }
      }
      return {
        success: true,
        data,
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao carregar dados postais. Tente novamente.' }
    }
  },
}

