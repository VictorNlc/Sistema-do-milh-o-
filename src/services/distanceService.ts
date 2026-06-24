// ============================================================
// Distance / Freight Service — Cálculo de frete via OpenRouteService
// ============================================================

/** Coordenadas fixas da fábrica (Teutônia - RS - Brasil) */
const FACTORY_LOCATION = {
  latitude: -29.4816568,
  longitude: -51.813752,
}

/** Custo por quilômetro em Reais (R$) */
const PRICE_PER_KM = 3.5

/** URL base da API OpenRouteService */
const ORS_BASE_URL = 'https://api.openrouteservice.org/v2/directions/driving-car'

/** Resultado do cálculo de frete */
export interface FreightCalculation {
  distanceKm: number
  shippingCost: number
}

/** Resultado interno (inclui controle de sucesso/erro) */
export interface FreightResult {
  success: boolean
  data?: FreightCalculation
  error?: string
}

/** Estrutura relevante da resposta da API ORS */
interface OrsResponse {
  routes: Array<{
    summary: {
      distance: number // em metros
      duration: number // em segundos
    }
  }>
}

/**
 * Calcula a distância rodoviária entre a fábrica e o destino informado,
 * e retorna o valor estimado do frete.
 *
 * @param destinationLatitude  - Latitude do destino (cliente)
 * @param destinationLongitude - Longitude do destino (cliente)
 * @returns Resultado com distância em km e valor do frete, ou mensagem de erro
 */
export async function calculateDistance(
  destinationLatitude: number,
  destinationLongitude: number
): Promise<FreightResult> {
  const apiKey = import.meta.env.VITE_ORS_API_KEY

  if (!apiKey) {
    console.error('[Freight] Chave da API OpenRouteService não configurada (VITE_ORS_API_KEY).')
    return {
      success: false,
      error: 'Chave da API de rotas não configurada.',
    }
  }

  console.log('[Freight] Calculando distância...')
  console.log({
    origem: {
      latitude: FACTORY_LOCATION.latitude,
      longitude: FACTORY_LOCATION.longitude,
      descricao: 'Fábrica — Teutônia, RS',
    },
    destino: {
      latitude: destinationLatitude,
      longitude: destinationLongitude,
    },
  })

  // ORS espera [longitude, latitude]
  const body = {
    coordinates: [
      [FACTORY_LOCATION.longitude, FACTORY_LOCATION.latitude],
      [destinationLongitude, destinationLatitude],
    ],
  }

  try {
    const response = await fetch(ORS_BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      console.error(`[Freight] Erro HTTP: ${response.status}`, errorText)

      // NOVO FLUXO: Detectar erro de coordenada não roteável
      if (
        response.status === 404 &&
        (errorText.includes('Could not find routable point') || errorText.includes('2010'))
      ) {
        console.warn('[Freight] Coordenada não roteável detectada.')
        return {
          success: false,
          error: 'unroutable',
        }
      }

      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          error: 'Chave da API de rotas inválida ou sem permissão.',
        }
      }

      return {
        success: false,
        error: 'Erro ao consultar serviço de rotas.',
      }
    }

    const data: unknown = await response.json()

    // Validar estrutura da resposta
    const orsData = data as OrsResponse

    if (!orsData?.routes || !Array.isArray(orsData.routes) || orsData.routes.length === 0) {
      console.error('[Freight] Rota não encontrada na resposta:', data)
      return {
        success: false,
        error: 'Rota não encontrada entre a fábrica e o destino informado.',
      }
    }

    const summary = orsData.routes[0]?.summary

    if (!summary || typeof summary.distance !== 'number') {
      console.error('[Freight] Resposta inválida — campo distance ausente:', data)
      return {
        success: false,
        error: 'Resposta inválida recebida do serviço de rotas.',
      }
    }

    // Converter metros para quilômetros
    const distanceKm = Number((summary.distance / 1000).toFixed(2))

    // Calcular frete
    const shippingCost = Number((distanceKm * PRICE_PER_KM).toFixed(2))

    console.log('[Freight] Resultado:')
    console.log(`Distância: ${distanceKm} km`)
    console.log(`Frete: R$ ${shippingCost.toFixed(2)}`)
    console.log({ distanceKm, shippingCost })

    return {
      success: true,
      data: { distanceKm, shippingCost },
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      console.error('[Freight] Timeout na consulta ao OpenRouteService.')
    } else {
      console.error('[Freight] Erro ao calcular distância:', err)
    }

    return {
      success: false,
      error: 'Erro ao consultar serviço de rotas.',
    }
  }
}
