// ============================================================
// Paraguay Provider — Consulta via arquivo CSV local
// ============================================================

import type { PostalCodeProvider, ProviderResult } from '../types'

/**
 * Registro do CSV de zonas postais do Paraguai.
 * Colunas: dpto;dpto_desc;distrito;dist_desc;area_1;barloc;barlo_desc;viv_2014;div_post;zona;cod_post;obs;cod_bar
 */
interface ParaguayPostalEntry {
  postalCode: string
  city: string       // dist_desc (Distrito)
  state: string      // dpto_desc (Departamento)
}

/** Cache em memória: código postal → entrada */
let postalCodeMap: Map<string, ParaguayPostalEntry> | null = null

/**
 * Carrega e parseia o CSV do Paraguai.
 * O CSV é carregado via import dinâmico com ?raw do Vite (bundled no build).
 * Executado apenas uma vez; cache em memória evita re-processamento.
 */
async function loadParaguayCsv(): Promise<Map<string, ParaguayPostalEntry>> {
  if (postalCodeMap) return postalCodeMap

  try {
    // Import dinâmico com ?raw — Vite retorna o conteúdo como string
    const csvModule = await import('../../../data/ZONA_POSTAL_PARAGUAY.csv?raw')
    const csvText: string = csvModule.default

    const map = new Map<string, ParaguayPostalEntry>()
    const lines = csvText.split('\n')

    // Pula a linha de cabeçalho
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      const columns = line.split(';')
      if (columns.length < 11) continue

      const dpto_desc = columns[1]?.trim() || ''
      const dist_desc = columns[3]?.trim() || ''
      const cod_post = columns[10]?.trim() || ''

      if (!cod_post || !dpto_desc) continue

      // Normaliza o código postal (remove espaços extras)
      const normalizedCode = cod_post.replace(/\s+/g, '').trim()

      // Usa o primeiro registro encontrado para cada código postal
      // (geralmente o distrito principal)
      if (!map.has(normalizedCode)) {
        map.set(normalizedCode, {
          postalCode: normalizedCode,
          city: dist_desc || dpto_desc,
          state: dpto_desc,
        })
      }
    }

    console.info(`[PY Provider] CSV carregado: ${map.size} códigos postais únicos`)
    postalCodeMap = map
    return map
  } catch (err) {
    console.error('[PY Provider] Erro ao carregar CSV:', err)
    throw new Error('Falha ao carregar dados de códigos postais do Paraguai.')
  }
}

export const paraguayProvider: PostalCodeProvider = {
  countryCode: 'PY',
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
      const map = await loadParaguayCsv()
      const entry = map.get(digits)

      if (!entry) {
        return { success: false, error: 'Código postal não encontrado.' }
      }

      return {
        success: true,
        data: {
          country: 'PY',
          city: entry.city,
          state: entry.state,
        },
      }
    } catch {
      return { success: false, error: 'Erro ao carregar dados postais. Tente novamente.' }
    }
  },
}
