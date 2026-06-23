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

/**
 * Normaliza o código postal do Paraguai.
 * Remove espaços, caracteres não numéricos e valida tamanho entre 4 e 6 dígitos.
 */
export function normalizeParaguayPostalCode(code: string): string {
  const normalized = code.replace(/\D/g, '')
  const isValid = /^\d{4,6}$/.test(normalized)
  if (!isValid) {
    throw new Error('Formato de código postal paraguaio inválido.')
  }
  return normalized
}

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

    // Logs temporários para identificar o encoding detectado
    const hasReplacementChar = csvText.includes('\uFFFD')
    const hasSpanishChars = /[ÁÉÍÓÚÑÜáéíóúñü]/.test(csvText)
    console.info('[PY Provider] Leitura do CSV iniciada.')
    console.info(`[PY Provider] Presença de caracteres especiais espanhóis (Á, É, Í, Ó, Ú, Ñ, Ü): ${hasSpanishChars ? 'Sim' : 'Não'}`)
    console.info(`[PY Provider] Presença de caracteres corrompidos (\\uFFFD): ${hasReplacementChar ? 'Sim' : 'Não'}`)
    if (!hasReplacementChar && hasSpanishChars) {
      console.info('[PY Provider] UTF-8 detectado e validado com sucesso (sem corrupção de caracteres).')
    } else if (hasReplacementChar) {
      console.warn('[PY Provider] Caracteres corrompidos detectados! O arquivo original pode estar usando um encoding diferente ou a conversão falhou.')
    }

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
