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

  // Monta a query: Cidade, Estado, País
  const query = `${city}, ${state}, ${country}`

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
