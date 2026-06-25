// ============================================================
// Paraguay Provider — Consulta via arquivo CSV local
// Supporting 4, 5, and 6 digit formats with fallback
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

export interface ParaguayLocation {
  department: string
  city: string
  postalCode: string
}

let paraguayLocations: ParaguayLocation[] | null = null

async function loadParaguayLocations(): Promise<ParaguayLocation[]> {
  if (paraguayLocations) return paraguayLocations

  const map = new Map<string, ParaguayLocation>()
  try {
    const csvModule = await import('../../../data/ZONA_POSTAL_PARAGUAY.csv?raw')
    const csvText: string = csvModule.default
    const lines = csvText.split('\n')

    const capitalize = (str: string) => {
      if (!str) return ''
      const words = str.toLowerCase().split(/\s+/)
      const lowercaseWords = new Set([
        'de', 'del', 'la', 'las', 'el', 'los', 'y', 'al', 'o', 'e', 'en',
        'do', 'da', 'dos', 'das', 'de', 'e', 'em'
      ])
      return words.map((word, index) => {
        if (word === '') return ''
        if (lowercaseWords.has(word) && index > 0 && index < words.length - 1) {
          return word
        }
        return word.charAt(0).toUpperCase() + word.slice(1)
      }).join(' ')
    }

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      const columns = line.split(';')
      if (columns.length < 11) continue

      const dpto_desc = columns[1]?.trim() || ''
      const dist_desc = columns[3]?.trim() || ''
      const cod_post = columns[10]?.trim() || ''

      if (!cod_post || !dpto_desc) continue

      const deptCap = capitalize(dpto_desc)
      const distCap = capitalize(dist_desc || dpto_desc)
      const normalizedCode = cod_post.replace(/\s+/g, '').trim()

      const key = `${deptCap}|${distCap}`
      if (!map.has(key)) {
        map.set(key, {
          department: deptCap,
          city: distCap,
          postalCode: normalizedCode
        })
      }
    }

    paraguayLocations = Array.from(map.values())
    return paraguayLocations
  } catch (err) {
    console.error('[PY Provider] Erro ao carregar locais:', err)
    return []
  }
}

/**
 * Carrega e parseia o CSV do Paraguai.
 * O CSV é carregado via import dinâmico com ?raw do Vite (bundled no build).
 * Executado apenas uma vez; cache em memória evita re-processamento.
 */
async function loadParaguayCsv(): Promise<Map<string, ParaguayPostalEntry>> {
  if (postalCodeMap) return postalCodeMap

  try {
    const locs = await loadParaguayLocations()
    const map = new Map<string, ParaguayPostalEntry>()

    for (const l of locs) {
      if (!map.has(l.postalCode)) {
        map.set(l.postalCode, {
          postalCode: l.postalCode,
          city: l.city,
          state: l.department,
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

export async function getParaguayDepartments(): Promise<string[]> {
  const locs = await loadParaguayLocations()
  const depts = new Set(locs.map(l => l.department))
  return Array.from(depts).sort((a, b) => a.localeCompare(b))
}

export async function getParaguayCities(department: string): Promise<string[]> {
  const locs = await loadParaguayLocations()
  const targetDept = department.toLowerCase().trim()
  const cities = new Set(
    locs
      .filter(l => l.department.toLowerCase().trim() === targetDept)
      .map(l => l.city)
  )
  return Array.from(cities).sort((a, b) => a.localeCompare(b))
}

export async function getParaguayPostcode(department: string, city: string): Promise<string | null> {
  const locs = await loadParaguayLocations()
  const targetDept = department.toLowerCase().trim()
  const targetCity = city.toLowerCase().trim()
  const found = locs.find(
    l => l.department.toLowerCase().trim() === targetDept && l.city.toLowerCase().trim() === targetCity
  )
  return found ? found.postalCode : null
}

export function normalizeParaguayPostalCode(code: string): string {
  const normalized = code.replace(/\D/g, '')
  const isValid = /^\d{4,6}$/.test(normalized)
  if (!isValid) {
    throw new Error('Formato de código postal paraguaio inválido.')
  }
  return normalized
}

export const paraguayProvider: PostalCodeProvider = {
  countryCode: 'PY',
  postalCodeLength: 4, // default fallback length
  placeholder: 'Ex: 1000, 10001 ou 100001',

  sanitize(value: string): string {
    return value.replace(/\D/g, '')
  },

  formatMask(value: string): string {
    return this.sanitize(value).slice(0, 6)
  },

  isComplete(value: string): boolean {
    const len = this.sanitize(value).length
    return len >= 4 && len <= 6
  },

  async lookup(postalCode: string): Promise<ProviderResult> {
    let sanitized: string
    try {
      sanitized = normalizeParaguayPostalCode(postalCode)
    } catch {
      return { success: false, error: 'Informe um código postal paraguaio válido. Exemplos: 1000, 10001 ou 100001' }
    }

    try {
      const map = await loadParaguayCsv()

      // 1. Tenta buscar exatamente o valor informado
      let entry = map.get(sanitized)

      // 2. Se possuir 6 dígitos e não encontrar, tenta os primeiros 5 dígitos
      if (!entry && sanitized.length === 6) {
        const fiveDigits = sanitized.substring(0, 5)
        entry = map.get(fiveDigits)
      }

      // 3. Se possuir 5 ou 6 dígitos e ainda não encontrar, tenta os primeiros 4 dígitos
      if (!entry && (sanitized.length === 5 || sanitized.length === 6)) {
        const fourDigits = sanitized.substring(0, 4)
        entry = map.get(fourDigits)
      }

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
