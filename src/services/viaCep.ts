// ============================================================
// ViaCEP Service — Consulta e validação de CEP brasileiro
// ============================================================

/** Resposta da API ViaCEP */
export interface ViaCepResponse {
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

/** Resultado padronizado da consulta de CEP */
export interface CepResult {
  success: boolean
  city?: string
  state?: string
  error?: string
}

/** Países do Mercosul */
export interface MercosulCountry {
  code: string
  name: string
}

export const MERCOSUL_COUNTRIES: MercosulCountry[] = [
  { code: 'BR', name: 'Brasil' },
  { code: 'AR', name: 'Argentina' },
  { code: 'PY', name: 'Paraguai' },
  { code: 'UY', name: 'Uruguai' },
  { code: 'BO', name: 'Bolívia' },
]

/**
 * Remove caracteres não numéricos do CEP.
 */
export function sanitizeCep(cep: string): string {
  return cep.replace(/\D/g, '')
}

/**
 * Valida se o CEP possui exatamente 8 dígitos.
 */
export function isValidBrazilianCep(cep: string): boolean {
  const digits = sanitizeCep(cep)
  return digits.length === 8
}

/**
 * Aplica máscara de CEP brasileiro: 00000-000
 */
export function formatCepMask(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 5) return digits
  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

/**
 * Consulta a API ViaCEP para buscar dados de endereço a partir do CEP.
 * Retorna um resultado padronizado com cidade e estado ou mensagem de erro.
 */
export async function fetchAddressByCep(cep: string): Promise<CepResult> {
  const digits = sanitizeCep(cep)

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
      city: data.localidade,
      state: data.uf,
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      return { success: false, error: 'Tempo de resposta esgotado. Tente novamente.' }
    }
    return { success: false, error: 'Erro de conexão. Verifique sua internet e tente novamente.' }
  }
}
