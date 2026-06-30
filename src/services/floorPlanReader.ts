import { supabase } from './supabase'

export function isApiKeyConfigured(): boolean {
  // Retornamos true assumindo que a edge function está configurada com a chave
  return true
}

export interface FloorPlanData {
  analysis?: string
  storeWidth: number
  storeHeight: number
  entrance: { x: number; y: number; orientation: 'N' | 'S' | 'E' | 'W' } | null
  emergencyExit: { x: number; y: number; orientation: 'N' | 'S' | 'E' | 'W' } | null
  pillars: { x: number; y: number }[]
  obstacles: {
    id?: string
    name: string
    x: number
    y: number
    width: number
    height: number
    rotation: number
  }[]
}

export interface FloorPlanResult {
  success: boolean
  data?: FloorPlanData
  error?: string
}

/**
 * Converte um arquivo do navegador para base64.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => {
      const result = reader.result as string
      // Remove o prefixo "data:*/*;base64,"
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = (error) => reject(error)
  })
}

/**
 * Envia o croqui ou desenho técnico (em base64) para a API de visão da OpenAI.
 * A IA identifica a largura, comprimento, portas, pilares e salas internas.
 */
export async function readFloorPlanImage(base64Image: string, mimeType: string = 'image/jpeg'): Promise<FloorPlanResult> {
  const prompt = `Você é um Engenheiro e Arquiteto de Layout ultra-preciso especialista em conversão e vetorização de plantas baixas e croquis para farmácias.
Sua tarefa é analisar a imagem enviada (que pode ser um desenho à mão livre/croqui ou uma planta técnica de engenharia) e extrair os dados estruturais e as dimensões físicas com assertividade absoluta e precisão máxima (tolerância de erro matemática próxima de zero, ex: 0.0000000001m se necessário).

Instruções Cruciais para Calibragem e Escala:
1. IDENTIFIQUE AS COTAS: Encontre e leia atentamente os números textuais na imagem que marcam as dimensões (ex: "8m", "8.5", "12m", "4,20"). Use estas cotas reais como âncoras primárias.
2. ESTABELEÇA UMA RÉGUA/ESCALA DE PIXELS: Calcule a proporção de pixels na imagem para cada metro linear com base nas maiores dimensões identificadas.
3. SE FOR UM CROQUI (À mão livre): Croquis podem não ter proporções geométricas 100% fiéis de pixels. Por isso, use os valores numéricos explicitamente anotados pelo usuário na imagem para as dimensões das paredes, portas e cômodos, calculando suas coordenadas relativas com precisão matemática estrita de soma/subtração de cotas.
4. SISTEMA DE COORDENADAS:
   - Origem (0,0): Canto superior esquerdo da loja.
   - Eixo X: Horizontal (largura da loja).
   - Eixo Y: Vertical (comprimento da loja).
   - Todas as medidas devem ser floats extremamente precisos (em metros).

Você deve mapear com assertividade absoluta:
1. Dimensões totais: a largura exata (storeWidth) e o comprimento exato (storeHeight).
2. Porta de entrada principal (entrance): a coordenada exata (x, y) de seu centro e a orientação em que está embutida na parede (N, S, E, W).
3. Porta de saída de emergência (emergencyExit): se houver, indicar sua coordenada (x, y) e orientação (N, S, E, W).
4. Pilares estruturais (pillars): posições exatas (x, y) de cada pilar existente.
5. Cômodos internos, divisões ou obstáculos (obstacles): como banheiros, consultórios, copas ou paredes internas. Obtenha para cada um:
   - "name": O rótulo exato (ex: 'Sanitário', 'Sala de Injeção', 'Paredes Internas').
   - "x", "y": Coordenadas do canto superior esquerdo com máxima aproximação.
   - "width": Largura exata.
   - "height": Comprimento exato.
   - "rotation": Rotação em graus (normalmente 0, 90, 180 ou 270).

Sua resposta DEVE ser um objeto JSON sem blocos de texto externos. Siga estritamente a estrutura abaixo:

{
  "analysis": "Seu memorial de cálculo descritivo detalhado: como você identificou a escala, as cotas de cada elemento, as somas que realizou para definir o X/Y de cada cômodo/pilar e a justificativa de suas posições geométricas.",
  "storeWidth": 10.0,
  "storeHeight": 12.0,
  "entrance": { "x": 5.0, "y": 12.0, "orientation": "S" },
  "emergencyExit": null,
  "pillars": [
    { "x": 3.0, "y": 4.5 }
  ],
  "obstacles": [
    { "name": "Sala de Aplicação", "x": 0.0, "y": 0.0, "width": 2.5, "height": 3.0, "rotation": 0 }
  ]
}

Seja cirúrgico e impecável. Garanta que todas as coordenadas fiquem perfeitamente dentro dos limites da largura (storeWidth) e comprimento (storeHeight) da loja.`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 40000) // 40 segundos de timeout para visão

  try {
    if (!supabase) throw new Error("Supabase não está configurado.")
    const { data: responseData, error: edgeError } = await supabase.functions.invoke('openai-proxy', {
      body: {
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`
                }
              }
            ]
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.0, // temperatura 0 para máxima consistência e determinação
        max_tokens: 1500,
      },
    })

    if (edgeError) {
      throw edgeError
    }

    const data = responseData as any
    const content = data?.choices?.[0]?.message?.content?.trim()

    if (!content) {
      return {
        success: false,
        error: 'Resposta vazia da API de Visão da OpenAI.',
      }
    }

    // Limpa possíveis marcações de bloco de código markdown ```json ... ```
    let jsonStr = content
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      jsonStr = jsonMatch[0]
    }

    const parsed = JSON.parse(jsonStr) as FloorPlanData

    // Validações básicas dos dados retornados
    if (typeof parsed.storeWidth !== 'number' || typeof parsed.storeHeight !== 'number') {
      return {
        success: false,
        error: 'A IA falhou em identificar as dimensões básicas da loja.',
      }
    }

    // Normalização de arrays
    parsed.pillars = Array.isArray(parsed.pillars) ? parsed.pillars : []
    parsed.obstacles = Array.isArray(parsed.obstacles) ? parsed.obstacles : []

    return {
      success: true,
      data: parsed,
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        success: false,
        error: 'A análise da imagem demorou muito e o tempo limite expirou.',
      }
    }
    const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido'
    return {
      success: false,
      error: `Falha na análise da planta: ${errorMessage}`,
    }
  } finally {
    clearTimeout(timeoutId)
  }
}
