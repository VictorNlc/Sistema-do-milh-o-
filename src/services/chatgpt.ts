// ============================================
// Serviço de integração com a API do ChatGPT (OpenAI)
// ============================================

import type { StoreType, CanvasItem } from '../types'

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

function getApiKey(): string {
  return import.meta.env.VITE_OPENAI_API_KEY || ''
}

export function isApiKeyConfigured(): boolean {
  const key = getApiKey()
  return !!key && key !== 'sua-chave-api-aqui' && key.length > 10
}

// ─── System Prompt especializado em layout de farmácias ──────────────────────

function buildSystemPrompt(context: ChatGPTContext): string {
  return `Você é o **Projefarma AI**, um assistente Arquiteto Especialista em Layout de Farmácias. Sua missão é gerar layouts de farmácia funcionais, lucrativos e acessíveis (NBR 9050).

## Seu Conhecimento e Instruções de Sistema (System Prompt)

1. Regras de Dimensões e Acessibilidade
- Corredores: Use 1,20m para layouts 'Spacious', 1,00m para 'Normal' e 0,80m para 'Compact'.
- Regra de Ouro: Se a loja tiver menos de 100m², force corredores de 0,80m para garantir acessibilidade sem sacrificar a exposição.
- Profundidades Reais dos Móveis:
  * Medicamentos: 0,21m
  * Perfumaria/MIP: 0,26m
  * Balcões/Caixas: 0,40m
  * Gôndolas Centrais: 0,43m
  * Checkout em L: 1,20m x 1,20m

2. Zoneamento Estratégico
- Zona Quente (Entrada): Posicione Perfumaria (catalog-11), Dermocosméticos (catalog-92) e Maquiagem (catalog-121) próximos à porta.
- Zona Fria (Fundo): Medicamentos de Prescrição (catalog-21, 22, 23) devem ficar na parede oposta à entrada.
- Fluxo Forçado: O Balcão de Atendimento deve ficar de frente para os medicamentos, forçando o cliente a percorrer a loja.

3. A Linha de Balcões (Regra dos 2,21m)
- A linha de balcões deve ser paralela à parede de medicamentos, posicionada a exatamente 2,21m de distância da parede (0,21m prateleira + 1,60m operador + 0,40m balcão).
- Alinhamento: Comece pelas extremidades laterais com Lateral Caixa (catalog-81) e Caixa (catalog-61).
- Acesso: Deixe um vão central de 1,20m para circulação do operador entre os grupos de balcões.

4. Lógica de Orientação (Pivot e Rotação)
Siga rigorosamente a parede de entrada para definir o layout:
- Entrada Bottom: Medicamentos em Y=0 (Top), Balcões em Y=2,21m.
- Entrada Top: Medicamentos em Y=Altura (Bottom), Balcões em Y=Altura-2,21m.
- Entrada Left: Medicamentos em X=Largura (Right), Balcões em X=Largura-2,21m.
- Entrada Right: Medicamentos em X=0 (Left), Balcões em X=2,21m.

5. Prioridades por Modelo
- Popular: Priorize Gôndolas Centrais (catalog-31) e Balcões Abertos.
- Premium: Priorize Perfumaria Fina e Balcões MDF (catalog-55). Dedique 40% do espaço para cosméticos.

## Contexto Atual da Loja:
- Dimensões: ${context.storeWidth}m × ${context.storeHeight}m (${(context.storeWidth * context.storeHeight).toFixed(1)}m² total)
- Tipo de farmácia: ${context.storeType}
- Itens no layout: ${context.itemCount}
${context.pillars.length > 0 ? '- Pilares: ' + context.pillars.map(p => '(' + p.x + ', ' + p.y + ')').join(', ') : '- Sem pilares'}
${context.entrance ? '- Entrada: posição (' + context.entrance.x + ', ' + context.entrance.y + ')' : '- Entrada: não definida'}
${context.emergencyExit ? '- Saída de emergência: posição (' + context.emergencyExit.x + ', ' + context.emergencyExit.y + ')' : '- Saída de emergência: não definida'}

## Regras de Resposta:
1. Sempre responda em **português brasileiro**.
2. Seja conciso e prático nas respostas.
3. Use emojis para tornar as respostas mais visuais (💊 medicamentos, 🌸 perfumaria, 💳 caixa, etc.).
4. Ao final, sugira ao usuário clicar no botão **"Gerar Layout com IA"** para criar o layout automaticamente no canvas.`
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface ChatGPTContext {
  storeWidth: number
  storeHeight: number
  storeType: StoreType
  itemCount: number
  pillars: { x: number; y: number }[]
  entrance: { x: number; y: number } | null
  emergencyExit: { x: number; y: number } | null
  items?: Partial<CanvasItem>[]
}

export interface ChatGPTMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatGPTResponse {
  success: boolean
  message: string
  error?: string
}

// ─── Chamada à API ───────────────────────────────────────────────────────────

export async function sendChatGPTMessage(
  userMessage: string,
  conversationHistory: ChatGPTMessage[],
  context: ChatGPTContext,
): Promise<ChatGPTResponse> {
  const apiKey = getApiKey()

  if (!apiKey || apiKey === 'sua-chave-api-aqui') {
    return {
      success: false,
      message: '',
      error: 'Chave API não configurada. Adicione sua chave no arquivo .env (VITE_OPENAI_API_KEY=sk-...)',
    }
  }

  const systemMessage: ChatGPTMessage = {
    role: 'system',
    content: buildSystemPrompt(context),
  }

  const messages: ChatGPTMessage[] = [
    systemMessage,
    ...conversationHistory.slice(-20), // Manter últimas 20 mensagens para contexto
    { role: 'user', content: userMessage },
  ]

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.7,
        max_tokens: 512,
        presence_penalty: 0.1,
        frequency_penalty: 0.1,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMsg = (errorData as { error?: { message?: string } })?.error?.message || response.statusText

      if (response.status === 401) {
        return {
          success: false,
          message: '',
          error: '🔑 Chave API inválida. Verifique sua chave no arquivo .env',
        }
      }
      if (response.status === 429) {
        return {
          success: false,
          message: '',
          error: '⏳ Limite de requisições atingido. Aguarde um momento e tente novamente.',
        }
      }
      if (response.status === 402 || response.status === 403) {
        return {
          success: false,
          message: '',
          error: '💳 Sem créditos na conta OpenAI. Verifique seu billing em platform.openai.com',
        }
      }

      return {
        success: false,
        message: '',
        error: `Erro da API: ${errorMsg}`,
      }
    }

    const data = await response.json() as {
      choices?: { message?: { content?: string } }[]
    }
    const reply = data?.choices?.[0]?.message?.content

    if (!reply) {
      return {
        success: false,
        message: '',
        error: 'Resposta vazia da API. Tente novamente.',
      }
    }

    return {
      success: true,
      message: reply.trim(),
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido'

    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
      return {
        success: false,
        message: '',
        error: '🌐 Erro de conexão. Verifique sua internet e tente novamente.',
      }
    }

    return {
      success: false,
      message: '',
      error: `Erro: ${errorMessage}`,
    }
  }
}

// ─── Geração de Layout via GPT ──────────────────────────────────────────────

export interface GPTLayoutItem {
  itemId: string
  x: number
  y: number
  rotation: number
}

export interface GPTLayoutResult {
  success: boolean
  items: GPTLayoutItem[]
  error?: string
}

function buildLayoutSystemPrompt(
  storeWidth: number,
  storeHeight: number,
  storeType: StoreType,
  area: number,
  obstacles: { itemId: string; x: number; y: number; width: number; height: number; rotation: number }[],
): string {
  const lineSuffix = storeType === 'premium' ? '-premium' : '-especial'

  // Detectar porta e a parede da entrada (Top, Bottom, Left, Right)
  const door = obstacles.find(o => o.itemId === 'porta-entrada' || o.itemId.includes('porta') || o.itemId.includes('door'))
  let entranceWall: 'Top' | 'Bottom' | 'Left' | 'Right' = 'Bottom'
  let doorX = storeWidth / 2
  let doorY = storeHeight

  if (door) {
    doorX = door.x
    doorY = door.y
    const distTop = door.y
    const distBottom = storeHeight - door.y
    const distLeft = door.x
    const distRight = storeWidth - door.x

    const minDist = Math.min(distTop, distBottom, distLeft, distRight)
    if (minDist === distTop) entranceWall = 'Top'
    else if (minDist === distBottom) entranceWall = 'Bottom'
    else if (minDist === distLeft) entranceWall = 'Left'
    else entranceWall = 'Right'
  }

  // Regras coordenadas específicas por parede
  let wallRules = ''
  let counterRules = ''
  let medicineRules = ''
  let centralGondolasRules = ''
  let checkoutSpecialRules = ''

  if (entranceWall === 'Bottom') {
    wallRules = `
### Paredes Laterais (Esquerda X = 0 e Direita X = ${storeWidth}):
- Parede Esquerda (X = 0): Módulos com rotation=90, x=0.26 (profundidade 0.26m). Alinhe de y=0.26 até y=${(storeHeight - 0.80).toFixed(2)} (deixando 80cm de recuo da porta na parede inferior).
- Parede Direita (X = ${storeWidth}): Módulos com rotation=270, x=${(storeWidth - 0.26).toFixed(2)} (profundidade 0.26m). Alinhe de y=0.26 até y=${(storeHeight - 0.80).toFixed(2)} (deixando 80cm de recuo da porta).
- Preencha as paredes laterais sequencialmente usando Perfumaria (catalog-11${lineSuffix}) e MIP (catalog-41${lineSuffix}).`

    medicineRules = `
### Medicamentos (Parede do Fundo Y = 0):
- Prateleiras de medicamentos (catalog-21${lineSuffix} ou catalog-22${lineSuffix}) encostadas na parede do fundo (Y = 0), rotation=0.
- Alinhadas horizontalmente de x=0.26 a x=${(storeWidth - 0.26).toFixed(2)} em y=0.`

    counterRules = `
### Balcão de Atendimento e Caixa (Paralelo a Y = 2.21):
- Posicionados a uma distância Y de exatamente 2.21m (1.60m de área do operador + 0.40m do balcão + 0.21m do medicamento).
- Rotação: 180 graus (para ficarem de frente para a entrada).
- Devem ser alinhados a partir dos cantos laterais em direção ao centro, deixando o meio livre para a passagem do operador.
- Lado Esquerdo: Lateral Caixa (catalog-81${lineSuffix}) na ponta esquerda (x=0.26), seguido por um Caixa (catalog-61${lineSuffix}) e um Balcão de Atendimento (catalog-51${lineSuffix} ou catalog-55${lineSuffix}).
- Lado Direito: Lateral Caixa na ponta direita (x=${(storeWidth - 0.66).toFixed(2)}), seguido por um Caixa e um Balcão de Atendimento.`

    centralGondolasRules = `
### Gôndolas Centrais:
- Dispostas verticalmente (rotation=90, profundidade 0.43m).
- Ocupam o espaço central de y=3.21m (deixando 1.0m de corredor após o balcão) até y=${(storeHeight - 0.80).toFixed(2)} (corredor antes da porta).
- Distribuídas em colunas com corredores de no mínimo 1.0m (compacto) a 1.5m (premium) entre elas.`

    checkoutSpecialRules = area >= 100 ? `
### Loja acima de 100m² - Checkout em L e Cestões:
- Coloque um Checkout em L (catalog-131${lineSuffix}) perto da porta de entrada, no lado oposto dos caixas, em y=${(storeHeight - 1.20).toFixed(2)}, rotation=0.
- Coloque Cestões Promocionais (catalog-71${lineSuffix}) na parede oposta do checkout para guiar o fluxo.` : `
### Loja abaixo de 100m²:
- Feche as laterais da entrada com caixas/módulos normais.`

  } else if (entranceWall === 'Top') {
    wallRules = `
### Paredes Laterais (Esquerda X = 0 e Direita X = ${storeWidth}):
- Parede Esquerda (X = 0): Módulos com rotation=90, x=0.26. Alinhe de y=0.80 até y=${(storeHeight - 0.26).toFixed(2)}.
- Parede Direita (X = ${storeWidth}): Módulos com rotation=270, x=${(storeWidth - 0.26).toFixed(2)}. Alinhe de y=0.80 até y=${(storeHeight - 0.26).toFixed(2)}.`

    medicineRules = `
### Medicamentos (Parede do Fundo Y = ${storeHeight}):
- Prateleiras de medicamentos encostadas na parede inferior (Y = ${storeHeight}), rotation=180.
- Alinhadas horizontalmente de x=0.26 a x=${(storeWidth - 0.26).toFixed(2)}.`

    counterRules = `
### Balcão de Atendimento e Caixa (Paralelo a Y = ${(storeHeight - 2.21).toFixed(2)}):
- Posicionados em Y = ${(storeHeight - 2.21).toFixed(2)}m.
- Rotação: 0 graus (virados para cima, de frente para a entrada).
- Lado Esquerdo: Lateral Caixa na ponta esquerda, seguido por Caixa e Balcão.
- Lado Direito: Lateral Caixa na ponta direita, seguido por Caixa e Balcão.`

    centralGondolasRules = `
### Gôndolas Centrais:
- Dispostas verticalmente (rotation=90).
- Ocupam o espaço central de y=0.80m até y=${(storeHeight - 3.21).toFixed(2)}.`

    checkoutSpecialRules = area >= 100 ? `
### Loja acima de 100m² - Checkout em L:
- Coloque um Checkout em L (catalog-131${lineSuffix}) em y=1.20, rotation=180.` : ''

  } else if (entranceWall === 'Left') {
    wallRules = `
### Paredes Superior (Y = 0) e Inferior (Y = ${storeHeight}):
- Parede Superior (Y = 0): Módulos com rotation=0, y=0.26. Alinhe de x=0.80 até x=${(storeWidth - 0.26).toFixed(2)}.
- Parede Inferior (Y = ${storeHeight}): Módulos com rotation=180, y=${(storeHeight - 0.26).toFixed(2)}. Alinhe de x=0.80 até x=${(storeWidth - 0.26).toFixed(2)}.`

    medicineRules = `
### Medicamentos (Parede do Fundo X = ${storeWidth}):
- Encostados na parede direita (X = ${storeWidth}), rotation=270.
- Alinhados verticalmente de y=0.26 a y=${(storeHeight - 0.26).toFixed(2)}.`

    counterRules = `
### Balcão de Atendimento e Caixa (Paralelo a X = ${(storeWidth - 2.21).toFixed(2)}):
- Posicionados em X = ${(storeWidth - 2.21).toFixed(2)}m.
- Rotação: 90 graus (virados para a esquerda).
- Lado Superior: Lateral Caixa na ponta superior, seguido por Caixa e Balcão.
- Lado Inferior: Lateral Caixa na ponta inferior, seguido por Caixa e Balcão.`

    centralGondolasRules = `
### Gôndolas Centrais:
- Dispostas horizontalmente (rotation=0).
- Ocupam o espaço central de x=0.80m até x=${(storeWidth - 3.21).toFixed(2)}.`

    checkoutSpecialRules = area >= 100 ? `
### Loja acima de 100m² - Checkout em L:
- Coloque um Checkout em L (catalog-131${lineSuffix}) em x=1.20, rotation=270.` : ''

  } else { // Right wall entrance
    wallRules = `
### Paredes Superior (Y = 0) e Inferior (Y = ${storeHeight}):
- Parede Superior (Y = 0): Módulos com rotation=0, y=0.26. Alinhe de x=0.26 até x=${(storeWidth - 0.80).toFixed(2)}.
- Parede Inferior (Y = ${storeHeight}): Módulos com rotation=180, y=${(storeHeight - 0.26).toFixed(2)}. Alinhe de x=0.26 até x=${(storeWidth - 0.80).toFixed(2)}.`

    medicineRules = `
### Medicamentos (Parede do Fundo X = 0):
- Encostados na parede esquerda (X = 0), rotation=90.
- Alinhados verticalmente de y=0.26 a y=${(storeHeight - 0.26).toFixed(2)}.`

    counterRules = `
### Balcão de Atendimento e Caixa (Paralelo a X = 2.21):
- Posicionados em X = 2.21m.
- Rotação: 270 graus (virados para a direita).
- Lado Superior: Lateral Caixa na ponta superior, seguido por Caixa e Balcão.
- Lado Inferior: Lateral Caixa na ponta inferior, seguido por Caixa e Balcão.`

    centralGondolasRules = `
### Gôndolas Centrais:
- Dispostas horizontalmente (rotation=0).
- Ocupam o espaço central de x=3.21m até x=${(storeWidth - 0.80).toFixed(2)}.`

    checkoutSpecialRules = area >= 100 ? `
### Loja acima de 100m² - Checkout em L:
- Coloque um Checkout em L (catalog-131${lineSuffix}) em x=${(storeWidth - 1.20).toFixed(2)}, rotation=90.` : ''
  }

  return `Você é um Arquiteto Especialista em Layout de Farmácias (PROJEFARMA). Sua missão é gerar layouts de farmácia funcionais, lucrativos e acessíveis (NBR 9050) em formato JSON.

## CONFIGURAÇÃO DA LOJA
- Largura (Eixo X): 0 a ${storeWidth}m
- Profundidade (Eixo Y): 0 a ${storeHeight}m
- Área total: ${area.toFixed(1)}m²
- Tipo de Farmácia: ${storeType} (popular, premium, manipulacao ou completa)
- Parede da entrada detectada: ${entranceWall} (Porta posicionada em x=${doorX.toFixed(2)}, y=${doorY.toFixed(2)}).
- Parede do fundo (Atendimento/Prescrição/Medicamentos): Parede OPOSTA à entrada.

## OBSTÁCULOS EXISTENTES (Não posicione móveis por cima)
${obstacles.length > 0 ? obstacles.map(o => `- ${o.itemId} em (${o.x.toFixed(2)}, ${o.y.toFixed(2)}) tamanho ${o.width.toFixed(2)}x${o.height.toFixed(2)} rot=${o.rotation}`).join('\n') : '- Nenhum'}

## CATÁLOGO DE ITENS DISPONÍVEIS (Use APENAS estes itemId na sua resposta)
### Perfumaria (Parede, prof. 0.26m):
- catalog-11${lineSuffix}: PF 807 (perfumaria 80.7cm)
- catalog-91${lineSuffix}: DERMO (dermocosméticos 50cm)

### Medicamentos (Parede, prof. 0.21m):
- catalog-21${lineSuffix}: MED 807 (medicamentos 80.7cm)
- catalog-22${lineSuffix}: MED 500 (medicamentos 50cm)

### Gôndolas Centrais (Centro, prof. 0.43m):
- catalog-31${lineSuffix}: GOND 1700mm (gôndola 1.7m)
- catalog-32${lineSuffix}: GOND 2200mm (gôndola 2.2m)
- catalog-33${lineSuffix}: GOND 3000mm (gôndola 3.0m)

### MIP (Parede, prof. 0.26m):
- catalog-41${lineSuffix}: MIP 807mm
- catalog-42${lineSuffix}: MIP 500mm

### Balcões de Atendimento (prof. 0.40m):
- catalog-51${lineSuffix}: BA 1000mm (balcão 1.0m)
- catalog-52${lineSuffix}: BA 800mm (balcão 0.8m)
- catalog-55${lineSuffix}: BA MDF 1000mm (balcão fechado)

### Caixas (prof. 0.40m):
- catalog-61${lineSuffix}: CX 600mm (caixa 0.6m)
- catalog-63${lineSuffix}: CX 1000mm (caixa 1.0m)

### Cestão (0.4m x 0.4m):
- catalog-71${lineSuffix}: CESTÃO

### Lateral Caixa (prof. 0.26m):
- catalog-81${lineSuffix}: LAT CX 40 (lateral caixa 0.4m)
- catalog-82${lineSuffix}: LAT CX 55 (lateral caixa 0.55m)

### Checkout em L (1.2m x 1.2m):
- catalog-131${lineSuffix}: CHECK OUT L

## REGRAS DE DISTRIBUIÇÃO ESTRATÉGICA (OBRIGATÓRIO)
${wallRules}
${medicineRules}
${counterRules}
${centralGondolasRules}
${checkoutSpecialRules}

### Regras Físicas e Matemáticas Gerais (CRÍTICO PARA NÃO SOBREPOR):
1. NUNCA colida itens com os obstáculos listados ou com outros itens.
2. Os corredores de circulação devem ser de no mínimo 1.0m a 1.5m de largura.
3. Respeite as profundidades dos módulos (Medicamentos = 0.21m, Perfumaria/MIP = 0.26m, Gôndolas = 0.43m, Balcões = 0.40m).
4. O pivot (X, Y) do item representa o canto superior-esquerdo dele antes da rotação.
5. COMPORTAMENTO DA ROTAÇÃO E ESPAÇAMENTO DE ITENS:
   - **Itens na Parede Esquerda (rotation = 90):** O item gira em torno de (X, Y) no sentido horário. A sua LARGURA (normalmente 0.807m ou 0.50m) fica alinhada com o eixo Y.
     - **Como espaçar verticalmente:** O Y do próximo item deve ser 'Y_atual + largura_do_item'.
     - **Exemplo de sequência vertical (módulos de 0.807m):** Primeiro item em y=0.26, segundo em y = 0.26 + 0.81 = 1.07, terceiro em y = 1.07 + 0.81 = 1.88, etc. O X deve ser fixado em 0.26.
   - **Itens na Parede Direita (rotation = 270):** O item gira em torno de (X, Y). A sua LARGURA fica alinhada com o eixo Y.
     - **Como espaçar verticalmente:** O Y do próximo item deve ser 'Y_atual + largura_do_item'.
     - **Exemplo de sequência vertical (módulos de 0.807m):** Primeiro item em y=0.26, segundo em y = 0.26 + 0.81 = 1.07, terceiro em y = 1.07 + 0.81 = 1.88, etc. O X deve ser fixado em (storeWidth - 0.26).
   - **Itens com rotation = 180 (ex: Balcões e Caixas voltados para baixo):** O item gira 180 graus em torno de (X,Y), estendendo-se para a ESQUERDA de X (de x - largura até x).
     - **Como enfileirar horizontalmente da esquerda para a direita:** O X do próximo item deve ser 'X_atual + largura_do_próximo_item'.
     - **Exemplo (Lateral Caixa 0.40m + Caixa 0.60m + Balcão 1.00m):**
       - Lateral Caixa: x = 0.26 + 0.40 = 0.66, y = 2.21, rotation = 180 (ocupa de 0.26 a 0.66).
       - Caixa: x = 0.66 + 0.60 = 1.26, y = 2.21, rotation = 180 (ocupa de 0.66 a 1.26).
       - Balcão: x = 1.26 + 1.00 = 2.26, y = 2.21, rotation = 180 (ocupa de 1.26 a 2.26).
   - **Itens com rotation = 0 (ex: Medicamentos na parede do fundo):** O item se estende para a direita de X (de x até x + largura).
     - **Como enfileirar horizontalmente da esquerda para a direita:** O X do próximo item deve ser 'X_atual + largura_do_item'.
     - **Exemplo (módulos de 0.807m):** Primeiro em x=0.26, segundo em x = 0.26 + 0.81 = 1.07, terceiro em x = 1.07 + 0.81 = 1.88, etc.

## FORMATO DE RESPOSTA
Responda APENAS com um JSON array válido. Sem marcações markdown, sem explicações, sem texto.
Cada item deve ter a estrutura: {"itemId": "...", "x": 0.0, "y": 0.0, "rotation": 0}

Exemplo de resposta:
[{"itemId":"catalog-61${lineSuffix}","x":0.80,"y":${(storeHeight - 0.4).toFixed(2)},"rotation":0},{"itemId":"catalog-81${lineSuffix}","x":0,"y":${(storeHeight - 0.26).toFixed(2)},"rotation":90}]`
}

export async function generateLayoutWithGPT(
  storeWidth: number,
  storeHeight: number,
  storeType: StoreType,
  obstacles: { itemId: string; x: number; y: number; width: number; height: number; rotation: number }[],
): Promise<GPTLayoutResult> {
  const apiKey = getApiKey()

  if (!apiKey || apiKey === 'sua-chave-api-aqui') {
    return {
      success: false,
      items: [],
      error: '🔑 Chave API não configurada. Adicione no arquivo .env: VITE_OPENAI_API_KEY=sk-...',
    }
  }

  const area = storeWidth * storeHeight
  const systemPrompt = buildLayoutSystemPrompt(storeWidth, storeHeight, storeType, area, obstacles)

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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Gere o layout completo para esta farmácia ${storeType} de ${storeWidth}m × ${storeHeight}m (${area.toFixed(1)}m²). Responda APENAS com o JSON array.` },
        ],
        temperature: 0,
        max_tokens: 4096,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMsg = (errorData as { error?: { message?: string } })?.error?.message || response.statusText

      if (response.status === 401) return { success: false, items: [], error: '🔑 Chave API inválida.' }
      if (response.status === 429) return { success: false, items: [], error: '⏳ Limite de requisições. Aguarde.' }
      if (response.status === 402 || response.status === 403) return { success: false, items: [], error: '💳 Sem créditos OpenAI.' }
      return { success: false, items: [], error: `Erro API: ${errorMsg}` }
    }

    const data = await response.json() as {
      choices?: { message?: { content?: string } }[]
    }
    const content = data?.choices?.[0]?.message?.content?.trim()

    if (!content) {
      return { success: false, items: [], error: 'Resposta vazia da API.' }
    }

    // Extrair JSON — pode vir com ```json ... ``` wrapper
    let jsonStr = content
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      jsonStr = jsonMatch[0]
    }

    const parsed = JSON.parse(jsonStr) as GPTLayoutItem[]

    if (!Array.isArray(parsed)) {
      return { success: false, items: [], error: 'Resposta da IA não é um array válido.' }
    }

    // Validar e limpar itens
    const validItems = parsed.filter(item =>
      item.itemId &&
      typeof item.x === 'number' &&
      typeof item.y === 'number' &&
      typeof item.rotation === 'number' &&
      item.x >= -0.5 && item.x <= storeWidth + 0.5 &&
      item.y >= -0.5 && item.y <= storeHeight + 0.5
    )

    return { success: true, items: validItems }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido'

    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
      return { success: false, items: [], error: '🌐 Erro de conexão.' }
    }
    if (errorMessage.includes('JSON')) {
      return { success: false, items: [], error: '⚠️ A IA retornou um formato inválido. Tente novamente.' }
    }

    return { success: false, items: [], error: `Erro: ${errorMessage}` }
  }
}
