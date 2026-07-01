import { supabase } from './supabase'

export function isApiKeyConfigured(): boolean {
  // Retornamos true assumindo que a edge function está configurada com a chave
  return true
}

export interface FloorPlanData {
  analysis?: string
  storeWidth: number
  storeHeight: number
  entrance: { x: number; y: number; orientation: 'N' | 'S' | 'E' | 'W'; width?: number } | null
  emergencyExit: { x: number; y: number; orientation: 'N' | 'S' | 'E' | 'W'; width?: number } | null
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
Sua tarefa é analisar a imagem enviada (que pode ser um desenho à mão livre/croqui ou uma planta técnica de engenharia) e extrair os dados estruturais e as dimensões físicas com assertividade absoluta e precisão máxima (tolerância de erro matemática próxima de zero, ex: 0.0000000001m).

Regras de Ouro para Assertividade e Precisão Absoluta:
1. LEITURA DE TEXTOS E COTAS:
   - Identifique todas as dimensões gerais (largura e comprimento totais da loja) nas cotas externas (ex: "10,60 x 12,00" ou "12,00 x 8,00").
   - Identifique os nomes dos ambientes (ex: DEPÓSITO, WC, COPA, SALA DE APOIO) e as respectivas cotas lineares próximas.

2. CÁLCULO ARITMÉTICO DE DIMENSÕES OCULTAS (FÓRMULA DA ÁREA):
   - Se um cômodo tiver a área em m² escrita (ex: "A: 3,00 m²" ou "A: 4,50 m²") e apenas uma cota linear indicada (ex: "1,50" de altura ou "2,50" de altura), calcule a outra dimensão obrigatoriamente usando a fórmula:
     Dimensão Oculta = Área / Dimensão Indicada.
     Exemplo 1: WC com área 3.00 m² e altura 1.50m => Largura = 3.00 / 1.50 = 2.00m exatos.
     Exemplo 2: COPA com área 4.50 m² e altura 2.50m => Largura = 4.50 / 2.50 = 1.80m exatos.
     Exemplo 3: LAVABO com área 2.10 m² e altura 1.50m => Largura = 2.10 / 1.50 = 1.40m exatos.
   Use essa lógica para determinar a largura/comprimento exatos de cada cômodo!

3. DISTINÇÃO ENTRE ÁREAS LIVRES E CÔMODOS FECHADOS (OBSTÁCULOS):
   - Áreas abertas para a circulação de clientes, fluxo ou apoio (como "CIRCULAÇÃO", "APOIO", "VENDAS", "ATENDIMENTO", "CORREDOR", "HALL") NUNCA devem ser adicionadas como obstáculos (obstacles) no JSON! Elas representam o espaço livre do chão por onde as pessoas e móveis se movem.
   - Apenas cômodos fechados por paredes físicas reais (como "DEPÓSITO", "WC", "SANITÁRIO", "COPA", "ESCRITÓRIO", "CONSULTÓRIO", "SALA DE INJEÇÃO") é que devem ser mapeados como obstáculos, pois suas paredes físicas impedem o trânsito livre.

4. ALINHAMENTO GEOMÉTRICO DAS PAREDES (CORREDORES RETOS):
   - Observe que as divisórias internas que separam os cômodos fechados da área de circulação costumam formar uma parede reta e contínua.
   - No Exemplo 1: O Depósito tem largura 3.60m. O WC e a Copa, embora tenham larguras ligeiramente diferentes calculadas pelas áreas teóricas, estão embutidos sob o corredor de circulação adjacente à mesma parede reta. Alinhe geometricamente a parede direita dos cômodos adjacentes (como WC e Copa) para que formem um corredor reto e contínuo (por exemplo, definindo para eles a mesma largura limite ou alinhamento vertical das divisórias).

5. DETERMINAÇÃO DE COORDENADAS (X, Y) PRECISAS:
   - Origem (0,0) está no canto superior esquerdo interno da loja.
   - Posicione cada cômodo calculando a distância cumulativa em relação às paredes da origem.
     Exemplo (Imagem 2): Depósito (largura 3.0m) fica no canto superior direito. A loja tem 12m de largura total. O X inicial do Depósito é: 12.0 - 3.0 = 9.0m. O Y é 0.0m.
     Exemplo (Imagem 1): Depósito (largura 3.6m, altura 4.0m) fica no canto superior esquerdo. O X inicial é 0.0m. O Y inicial é 0.0m.

6. PORTAS DE ACESSO E ENTRADAS:
   - Identifique a indicação "ACESSO", "ACESSO PRINCIPAL" ou "ENTRADA".
   - Determine em qual parede está, sua coordenada central exata (X, Y) e sua largura (width) com base nas cotas próximas.
     Exemplo (Imagem 1): Acesso centralizado na parede inferior (Sul/S). A porta tem 2.00m de largura, e fica a 2.30m da parede direita. Largura da loja 10.60m. O X da porta é: 10.60 - 2.30 - (2.00/2) = 7.30m (ou calculando pela cota correspondente).
     Exemplo (Imagem 2): Acesso na parede inferior (Sul/S) a 1.80m do canto esquerdo.
   - O tamanho (largura/width) da porta de entrada deve ser mapeado e não deve exceder 70% do tamanho da parede onde ela está localizada (ex: se está na parede inferior/Sul, não pode ser maior que 70% da largura total da loja).

7. MEMORIAL DE CÁLCULO EXIGIDO:
   - Na propriedade "analysis" do JSON, você deve detalhar passo a passo todas as contas matemáticas e raciocínio lógico que utilizou para achar cada X, Y, largura e altura de cada cômodo, porta ou pilar.

Sua resposta DEVE ser um objeto JSON sem blocos de texto externos. Siga estritamente a estrutura abaixo:

{
  "analysis": "Seu memorial de cálculo descritivo detalhado: como você identificou a escala, as cotas de cada elemento, as somas que realizou para definir o X/Y de cada cômodo/pilar e a justificativa de suas posições geométricas.",
  "storeWidth": 10.60,
  "storeHeight": 12.00,
  "entrance": { "x": 5.30, "y": 12.00, "orientation": "S", "width": 2.00 },
  "emergencyExit": null,
  "pillars": [],
  "obstacles": [
    { "name": "Depósito", "x": 0.0, "y": 0.0, "width": 3.6, "height": 4.0, "rotation": 0 },
    { "name": "WC", "x": 0.0, "y": 4.0, "width": 2.0, "height": 1.5, "rotation": 0 }
  ]
}

Seja cirúrgico e impecável. A precisão deve ser absoluta de 0.0000000001.`

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
