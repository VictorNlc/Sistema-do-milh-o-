// ============================================================
// Geocoding Service — Consulta de coordenadas via Nominatim
// ============================================================

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org/search'

/** Coordenadas geográficas (latitude e longitude) */
export interface Coordinates {
  latitude: number
  longitude: number
}

/** Resultado da consulta de geocodificação */
export interface GeocodingResult {
  success: boolean
  data?: Coordinates
  error?: string
}

/** Resposta individual do Nominatim (campos relevantes) */
interface NominatimResponse {
  lat: string
  lon: string
  display_name: string
}

/**
 * Mapeamento de código de país (ISO 3166-1 Alpha-2) para nome em inglês.
 * O Nominatim funciona melhor com nomes em inglês.
 */
const COUNTRY_NAMES_EN: Record<string, string> = {
  BR: 'Brazil',
  AR: 'Argentina',
  PY: 'Paraguay',
  UY: 'Uruguay',
}

/**
 * Normaliza campos de texto para a geocodificação do Uruguai.
 * Remove acentos, caracteres especiais, espaços duplicados e aplica Capitalize.
 *
 * @param value - Valor do campo (cidade ou estado)
 * @returns String normalizada
 */
function normalizeUruguayLocation(value: string): string {
  if (!value) return ''
  // 1. Remover acentos
  let normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  // 2. Remover caracteres especiais desnecessários (mantém apenas letras, números e espaços)
  normalized = normalized.replace(/[^a-zA-Z0-9\s]/g, '')
  // 3. Remover espaços duplicados e extras
  normalized = normalized.replace(/\s+/g, ' ').trim()
  // 4. Aplicar Capitalize/Title Case
  return normalized
    .split(' ')
    .map(word => {
      if (!word) return ''
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

/**
 * Normaliza a cidade informada manualmente pelo usuário em caso de erro no OpenRouteService.
 * - Remove espaços extras e do início/fim.
 * - Converte para Title Case.
 * - Preserva caracteres válidos e acentuação.
 *
 * @param value - Nome da cidade
 * @returns Nome da cidade normalizado
 */
export function normalizeManualCity(value: string): string {
  if (!value) return ''
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(word => {
      if (!word) return ''
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

/**
 * Obtém as coordenadas geográficas (latitude e longitude) de uma localidade
 * utilizando a API pública do Nominatim (OpenStreetMap).
 *
 * @param countryCode - Código ISO do país (ex: 'BR', 'AR')
 * @param state       - Nome do estado ou província
 * @param city        - Nome da cidade
 * @returns Resultado com coordenadas ou mensagem de erro
 */
export async function getCoordinates(
  countryCode: string,
  state: string,
  city: string
): Promise<GeocodingResult> {
  const country = COUNTRY_NAMES_EN[countryCode] || countryCode

  console.log('[Geocoding] Iniciando consulta...')
  console.log({ country, state, city })

  let finalCity = city
  let finalState = state
  let finalCountry = country

  if (countryCode === 'UY' || country === 'Uruguay' || country === 'UY') {
    console.log('[UY] Valores originais:', {
      city,
      state,
    })

    const normalizedCity = normalizeUruguayLocation(city)
    const normalizedState = normalizeUruguayLocation(state)

    finalCity = normalizedCity
    finalState = normalizedState
    finalCountry = 'Uruguay'

    console.log('[UY] Valores normalizados:', {
      normalizedCity,
      normalizedState,
    })
  }

  // Monta a query: Cidade, Estado, País
  const query = `${finalCity}, ${finalState}, ${finalCountry}`

  const params = new URLSearchParams({
    format: 'jsonv2',
    limit: '1',
    q: query,
  })

  const url = `${NOMINATIM_BASE_URL}?${params.toString()}`

  try {
    const response = await fetch(url, {
      headers: {
        // Nominatim exige um User-Agent válido
        'User-Agent': 'ProjeLayout/1.0 (projefarma.com.br)',
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      console.error(`[Geocoding] Erro HTTP: ${response.status}`)
      return {
        success: false,
        error: 'Erro ao consultar serviço de geocodificação.',
      }
    }

    const data: unknown = await response.json()

    // Validar se a resposta é um array
    if (!Array.isArray(data)) {
      console.error('[Geocoding] Resposta inesperada:', data)
      return {
        success: false,
        error: 'Resposta inválida recebida do Nominatim.',
      }
    }

    // Validar se há resultados
    if (data.length === 0) {
      console.warn('[Geocoding] Nenhum resultado encontrado para:', query)
      return {
        success: false,
        error: 'Nenhuma coordenada encontrada para a localidade informada.',
      }
    }

    const result = data[0] as NominatimResponse

    // Validar presença de lat/lon
    if (!result.lat || !result.lon) {
      console.error('[Geocoding] Campos lat/lon ausentes na resposta:', result)
      return {
        success: false,
        error: 'Resposta inválida recebida do Nominatim.',
      }
    }

    const latitude = parseFloat(result.lat)
    const longitude = parseFloat(result.lon)

    if (isNaN(latitude) || isNaN(longitude)) {
      console.error('[Geocoding] Valores inválidos de lat/lon:', result.lat, result.lon)
      return {
        success: false,
        error: 'Resposta inválida recebida do Nominatim.',
      }
    }

    console.log('[Geocoding] Coordenadas encontradas:')
    console.log({
      latitude,
      longitude,
    })

    return {
      success: true,
      data: { latitude, longitude },
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      console.error('[Geocoding] Timeout na consulta ao Nominatim.')
    } else {
      console.error('[Geocoding] Erro de rede:', err)
    }

    return {
      success: false,
      error: 'Erro ao consultar serviço de geocodificação.',
    }
  }
}
