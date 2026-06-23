// ============================================================
// Postal Code Service — Serviço centralizado multi-país
// ============================================================

import type { PostalCodeProvider, ProviderResult } from './types'
import { brazilProvider } from './providers/brazilProvider'
import { argentinaProvider } from './providers/argentinaProvider'
import { uruguayProvider } from './providers/uruguayProvider'
import { paraguayProvider } from './providers/paraguayProvider'

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

  return provider.lookup(postalCode)
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
export function getPostalCodeLength(countryCode: string): number {
  const provider = providers[countryCode]
  return provider ? provider.postalCodeLength : 0
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
export function getPostalCodeMaxLength(countryCode: string): number {
  const provider = providers[countryCode]
  if (!provider) return 20
  // Brasil: 8 dígitos + 1 hífen = 9
  if (countryCode === 'BR') return 9
  return provider.postalCodeLength
}
