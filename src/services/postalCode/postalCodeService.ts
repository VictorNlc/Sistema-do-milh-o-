// ============================================================
// Postal Code Service — Serviço centralizado multi-país
// ============================================================

import type { PostalCodeProvider, ProviderResult } from './types'
import { brazilProvider } from './providers/brazilProvider'
import {
  argentinaProvider,
  getArgentinaProvinces,
  getArgentinaCities,
} from './providers/argentinaProvider'
import { uruguayProvider } from './providers/uruguayProvider'
import {
  paraguayProvider,
  getParaguayDepartments,
  getParaguayCities,
  getParaguayPostcode,
} from './providers/paraguayProvider'
import { URUGUAY_POSTCODES } from '../../data/uyPostcodes'

export type { PostalLookupResult, ProviderResult, SupportedCountry } from './types'
export { SUPPORTED_COUNTRIES } from './types'

/** Registry de providers por código de país */
const providers: Record<string, PostalCodeProvider> = {
  BR: brazilProvider,
  AR: argentinaProvider,
  UY: uruguayProvider,
  PY: paraguayProvider,
}

/**
 * Retorna o provider para um dado país, ou null se não suportado.
 */
export function getProvider(countryCode: string): PostalCodeProvider | null {
  return providers[countryCode] ?? null
}

/**
 * Converte uma string para o formato Capitalizado / Title Case.
 * Preserva as partículas comuns em minúsculas (de, del, la, y, do, da, etc.).
 */
export function capitalizeText(str: string): string {
  if (!str) return ''
  const words = str.toLowerCase().split(/\s+/)
  const lowercaseWords = new Set([
    'de', 'del', 'la', 'las', 'el', 'los', 'y', 'al', 'o', 'e', 'en', // Espanhol
    'do', 'da', 'dos', 'das', 'de', 'e', 'em' // Português
  ])

  const processed = words.map((word, index) => {
    if (word === '') return ''
    if (lowercaseWords.has(word) && index > 0 && index < words.length - 1) {
      return word
    }
    if (word.includes('-')) {
      return word.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('-')
    }
    return word.charAt(0).toUpperCase() + word.slice(1)
  })

  return processed.join(' ')
}

/**
 * Busca endereço por código postal, delegando ao provider correto.
 *
 * @param countryCode - Código ISO do país (ex: 'BR', 'AR')
 * @param postalCode  - Código postal informado pelo usuário
 * @returns Resultado padronizado com cidade e estado ou mensagem de erro
 */
export async function lookupPostalCode(
  countryCode: string,
  postalCode: string
): Promise<ProviderResult> {
  const provider = providers[countryCode]

  if (!provider) {
    return {
      success: false,
      error: `País "${countryCode}" não suportado para busca de código postal.`,
    }
  }

  const result = await provider.lookup(postalCode)

  if (result.success && result.data) {
    const rawCity = result.data.city
    const rawState = result.data.state
    return {
      ...result,
      data: {
        ...result.data,
        city: capitalizeText(rawCity),
        state: rawState.length === 2 ? rawState.toUpperCase() : capitalizeText(rawState),
      },
    }
  }

  return result
}

/**
 * Sanitiza o código postal de acordo com as regras do país.
 */
export function sanitizePostalCode(countryCode: string, value: string): string {
  const provider = providers[countryCode]
  return provider ? provider.sanitize(value) : value.trim()
}

/**
 * Aplica máscara de formatação do código postal.
 */
export function formatPostalCode(countryCode: string, value: string): string {
  const provider = providers[countryCode]
  return provider ? provider.formatMask(value) : value
}

/**
 * Verifica se o código postal está completo (pronto para busca).
 */
export function isPostalCodeComplete(countryCode: string, value: string): boolean {
  const provider = providers[countryCode]
  return provider ? provider.isComplete(value) : false
}

/**
 * Retorna o número de dígitos esperados para o código postal do país.
 */
/**
 * Retorna o número de dígitos esperados para o código postal do país.
 */
export function getPostalCodeLength(countryCode: string, value?: string): number {
  const provider = providers[countryCode]
  if (!provider) return 0
  if (countryCode === 'AR') {
    return 8
  }
  if (countryCode === 'PY' && value) {
    const sanitized = provider.sanitize(value)
    if (sanitized.length >= 6) return 6
    if (sanitized.length === 5) return 5
    return 4
  }
  return provider.postalCodeLength
}

/**
 * Retorna o placeholder do campo de código postal para o país.
 */
export function getPostalCodePlaceholder(countryCode: string): string {
  const provider = providers[countryCode]
  return provider ? provider.placeholder : 'Código postal'
}

/**
 * Retorna o maxLength do campo de input para o país.
 * Para o Brasil, inclui o caractere '-' na máscara.
 */
export function getPostalCodeMaxLength(countryCode: string, value?: string): number {
  const provider = providers[countryCode]
  if (!provider) return 20
  // Brasil: 8 dígitos + 1 hífen = 9
  if (countryCode === 'BR') return 9
  // Argentina: CPA tem no máximo 8 caracteres, numérico tem 4
  if (countryCode === 'AR') return 8
  // Paraguai: códigos de 4, 5 ou 6 dígitos
  if (countryCode === 'PY') return 6
  return provider.postalCodeLength
}

/**
 * Retorna um código postal de referência para um departamento do Uruguai.
 */
export function getReferencePostcodeForUruguay(department: string): string | null {
  const target = department.toLowerCase().trim()
  for (const key in URUGUAY_POSTCODES) {
    if (URUGUAY_POSTCODES[key].department.toLowerCase().trim() === target) {
      return URUGUAY_POSTCODES[key].postalCode
    }
  }
  return null
}

export {
  getParaguayDepartments,
  getParaguayCities,
  getParaguayPostcode,
  getArgentinaProvinces,
  getArgentinaCities,
}
