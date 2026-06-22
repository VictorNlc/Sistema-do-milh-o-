const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

function getApiKey(): string {
  return import.meta.env.VITE_OPENAI_API_KEY || ''
}

export function isApiKeyConfigured(): boolean {
  const key = getApiKey()
  return !!key && key !== 'sua-chave-api-aqui' && key.length > 10
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
  const apiKey = getApiKey()

  if (!apiKey || apiKey === 'sua-chave-api-aqui') {
    return {
      success: false,
      error: 'Chave API da OpenAI não configurada. Configure a variável VITE_OPENAI_API_KEY no arquivo .env.',
    }
  }

  const prompt = `Você é um Engenheiro e Arquiteto de Layout especialista em leitura de plantas baixas físicas de farmácias comerciais.
Sua tarefa é analisar o arquivo de imagem enviado (que pode ser um desenho à mão livre/croqui ou uma planta técnica feita por engenheiro) e extrair os dados estruturais e as dimensões reais do local para que possamos representá-lo no nosso editor digital 2D.

Instruções para o sistema de coordenadas:
- A origem (0,0) fica no canto superior esquerdo da loja.
- O eixo X corre na horizontal (largura da loja).
- O eixo Y corre na vertical (comprimento da loja).
- Todas as unidades de medida (posição, largura, comprimento) devem ser expressas em metros (float, ex: 12.5).

Você deve identificar na imagem:
1. Dimensões gerais da loja: a largura total (storeWidth) e o comprimento total (storeHeight). Tente ler as cotas na imagem. Se não houver números explícitos, faça uma estimativa razoável baseada nas proporções usuais de estabelecimentos comerciais (por exemplo, 10m x 12m).
2. Porta de entrada principal (entrance): sua coordenada central (x, y) e qual orientação ela está encostada na parede (N = Parede superior/Norte, S = Parede inferior/Sul, E = Parede direita/Leste, W = Parede esquerda/Oeste).
3. Porta de saída de emergência (emergencyExit): se houver, indicar sua coordenada (x, y) e orientação (N, S, E, W).
4. Pilares estruturais (pillars): lista de posições centralizadas (x, y) dos pilares que atrapalham o layout interno.
5. Divisões internas ou salas fechadas (obstacles): como banheiros, consultórios, salas de injetáveis, copa ou paredes internas que já existam. Indicar para cada um: o nome ('Sala de Injeção', 'Parede Divisória', etc.), as coordenadas (x, y) do canto superior esquerdo do obstáculo, sua largura, sua profundidade/altura física e o ângulo de rotação (normalmente 0, 90, 180 ou 270).

Responda APENAS com um objeto JSON válido. A resposta deve obedecer estritamente a esta estrutura:

{
  "analysis": "Explicação detalhada dos elementos visíveis, escala/cotas detectadas na imagem e o raciocínio passo a passo para calcular as coordenadas das divisórias e portas.",
  "storeWidth": 10.0,
  "storeHeight": 12.0,
  "entrance": { "x": 5.0, "y": 12.0, "orientation": "S" },
  "emergencyExit": null,
  "pillars": [
    { "x": 3.0, "y": 4.5 },
    { "x": 7.0, "y": 4.5 }
  ],
  "obstacles": [
    { "name": "Sala de Aplicação", "x": 0.0, "y": 0.0, "width": 2.5, "height": 3.0, "rotation": 0 }
  ]
}

Tenha extrema cautela para garantir que as coordenadas fiquem consistentes e dentro dos limites da largura (storeWidth) e do comprimento (storeHeight) definidos.`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 40000) // 40 segundos de timeout para visão

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
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
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMsg = errorData?.error?.message || response.statusText
      return {
        success: false,
        error: `Erro ao processar imagem na API da OpenAI: ${errorMsg}`,
      }
    }

    const data = await response.json()
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
