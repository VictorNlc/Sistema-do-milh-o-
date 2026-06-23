// ============================================================
// Postal Code Service — Shared types
// ============================================================

/** Resultado padronizado da consulta de código postal */
export interface PostalLookupResult {
  country: string
  city: string
  state: string
}

/** Resultado interno dos providers (inclui controle de sucesso/erro) */
export interface ProviderResult {
  success: boolean
  data?: PostalLookupResult
  error?: string
}

/** Interface que cada country provider deve implementar */
export interface PostalCodeProvider {
  /** Código do país (ISO 3166-1 Alpha-2) */
  countryCode: string

  /** Número de dígitos esperados no código postal */
  postalCodeLength: number

  /** Busca endereço pelo código postal */
  lookup(postalCode: string): Promise<ProviderResult>

  /** Aplica máscara ao código postal durante digitação */
  formatMask(value: string): string

  /** Placeholder exibido no campo de entrada */
  placeholder: string

  /** Remove caracteres não numéricos/inválidos */
  sanitize(value: string): string

  /** Valida se o código postal está completo */
  isComplete(value: string): boolean
}

/** País suportado no formulário */
export interface SupportedCountry {
  code: string
  name: string
}

/** Lista de países suportados (Mercosul, sem Bolívia) */
export const SUPPORTED_COUNTRIES: SupportedCountry[] = [
  { code: 'BR', name: 'Brasil' },
  { code: 'AR', name: 'Argentina' },
  { code: 'PY', name: 'Paraguai' },
  { code: 'UY', name: 'Uruguai' },
]
