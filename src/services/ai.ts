// ============================================
// AI Layout Assistant — Rule-based + Simulated AI
// Bug Fix: usa uuid real em vez de Math.random()
// ============================================

import { v4 as uuidv4 } from 'uuid'
import { getItemById } from '../data/items'
import type {
  StoreType,
  AILayoutResult,
  AILayoutZone,
  AIContext,
  CanvasItem,
  ItemCategory,
} from '../types'

// ─── Configurações por tipo de loja ──────────────────────────────────────────

interface StoreTypeConfig {
  name: string
  priority: string[]
  corridorMin: number
  focus: string
  tips: string[]
}

const STORE_TYPE_CONFIGS: Record<StoreType, StoreTypeConfig> = {
  popular: {
    name: 'Farmácia Popular',
    priority: ['catalog-31-premium', 'catalog-51-premium', 'catalog-61-premium', 'catalog-21-premium'],
    corridorMin: 1.2,
    focus: 'volume de vendas e acessibilidade',
    tips: [
      'Coloque o balcão de atendimento ao fundo para guiar o fluxo de clientes',
      'Gôndolas paralelas às paredes laterais criam corredores bem definidos',
      'Caixa próxima à saída facilita o fluxo de pagamento',
      'Área de medicamentos ao fundo aumenta o tempo de permanência',
    ],
  },
  premium: {
    name: 'Farmácia Premium',
    priority: ['catalog-92-premium', 'catalog-51-premium', 'catalog-55-premium', 'catalog-11-premium', 'catalog-31-premium'],
    corridorMin: 1.5,
    focus: 'experiência do cliente e perfumaria',
    tips: [
      'Dedique 30-40% do espaço para perfumaria e cosméticos',
      'Use ilhas centrais para criar experiência de browsing',
      'Consultório de beleza agrega valor ao serviço',
      'Iluminação e exposição dos produtos são diferenciais',
    ],
  },
  manipulacao: {
    name: 'Farmácia de Manipulação',
    priority: ['catalog-55-premium', 'catalog-51-premium', 'catalog-21-premium'],
    corridorMin: 1.2,
    focus: 'área técnica e manipulação',
    tips: [
      'Área de manipulação deve ser separada da área de vendas',
      'Geladeira específica para fórmulas é obrigatória',
      'Balcão farmacêutico em posição de destaque transmite confiança',
      'Sala de atendimento farmacêutico individualizado é diferencial',
    ],
  },
  completa: {
    name: 'Farmácia Completa',
    priority: ['catalog-31-premium', 'catalog-51-premium', 'catalog-61-premium', 'catalog-92-premium'],
    corridorMin: 1.3,
    focus: 'mix completo de produtos e serviços',
    tips: [
      'Divida o espaço em zonas: medicamentos, perfumaria, higiene e serviços',
      'Corredor central de entrada deve conduzir ao fundo',
      'Zona quente (entrada) para promoções e lançamentos',
      'Consultório farmacêutico aumenta fidelização',
    ],
  },
}

// ─── Geração de Layout ────────────────────────────────────────────────────────

export function generateAILayout(
  storeWidth: number,
  storeHeight: number,
  storeType: StoreType,
  existingObstacles: Partial<CanvasItem>[] = [],
): AILayoutResult {
  const config = STORE_TYPE_CONFIGS[storeType] ?? STORE_TYPE_CONFIGS.popular
  const minCorridor = 1.0 // Distância mínima padrão de 1m

  // Verificar dimensões mínimas
  if (storeWidth < 4 || storeHeight < 4) {
    return {
      items: [],
      messages: ['⚠️ A loja é muito pequena. O mínimo recomendado é 4m x 4m para uma farmácia funcional.'],
      valid: false,
      stats: { usedArea: '0', totalArea: (storeWidth * storeHeight).toFixed(1), corridorMin: minCorridor },
    }
  }

  const generatedItems: Partial<CanvasItem>[] = []

  // Helper para verificar colisões com pilares/obstáculos
  const collidesWithObstacle = (x: number, y: number, w: number, h: number, rot: number) => {
    const realW = rot === 90 || rot === 270 ? h : w
    const realH = rot === 90 || rot === 270 ? w : h
    let x1 = x
    let y1 = y
    if (rot === 90) {
      x1 = x - realW
    } else if (rot === 270) {
      x1 = x
      y1 = y - realH
    }

    return existingObstacles.some(obs => {
      const ox = obs.x ?? 0
      const oy = obs.y ?? 0
      const ow = obs.width ?? 0.3
      const oh = obs.height ?? 0.3
      
      // Margem de segurança de 0.05m
      return (
        x1 < ox + ow + 0.05 &&
        x1 + realW > ox - 0.05 &&
        y1 < oy + oh + 0.05 &&
        y1 + realH > oy - 0.05
      )
    })
  }

  // Sufixo da linha comercial baseada na escolha:
  // Se for premium, usa a linha premium. Caso contrário, usa especial.
  const lineSuffix = storeType === 'premium' ? '-premium' : '-especial'

  // ==========================================
  // 1. RETAGUARDA DE MEDICAMENTOS (PAREDE DO FUNDO)
  // ==========================================
  // Armários de medicamentos (MED, profundidade de 0.21m) encostados no fundo.
  // Colocamos ao longo da parede traseira (y = storeHeight - 0.21), rotacionados em 180 graus.
  // Deixamos um recuo lateral de 0.26m para não bater com as gôndolas laterais.
  const medShelfDepth = 0.21
  const backWallY = storeHeight - medShelfDepth
  const backWallStart = 0.26
  const backWallEnd = storeWidth - 0.26
  let currentX = backWallStart

  while (currentX + 0.807 <= backWallEnd) {
    // Escolhe o módulo de 1.0m (catalog-23) se couber, senão o de 0.807m (catalog-21)
    let itemId = `catalog-21${lineSuffix}`
    let w = 0.807
    if (currentX + 1.0 <= backWallEnd) {
      itemId = `catalog-23${lineSuffix}`
      w = 1.0
    }
    
    generatedItems.push(makeItem(
      itemId,
      'Prateleira Medicamentos',
      '💊',
      currentX,
      backWallY,
      w,
      medShelfDepth,
      '#FDF8F0',
      '#8B7355',
      { rotation: 180, isWallItem: true }
    ))
    currentX += w
  }

  // ==========================================
  // 2. BALCÃO DE ATENDIMENTO, CAIXAS E LATERAIS (ÁREA DE ATENDIMENTO)
  // ==========================================
  // Corredor livre para operador = 1.60 m.
  // Balcão fica posicionado a y = storeHeight - medShelfDepth - 1.60 - balcaoDepth
  const operatorSpace = 1.60
  const balcaoDepth = 0.40
  const balcaoY = storeHeight - medShelfDepth - operatorSpace - balcaoDepth // y = storeHeight - 2.21

  // Entre a parede lateral e os balcões deve haver o Lateral Caixa (catalog-81, largura 0.4m)
  // Colocamos um Lateral Caixa na esquerda e outro na direita.
  const latCaixaW = 0.4
  
  // Adiciona Lateral Caixa Esquerdo
  generatedItems.push(makeItem(
    `catalog-81${lineSuffix}`,
    'Lateral Caixa',
    '📥',
    0.26,
    balcaoY,
    latCaixaW,
    0.26,
    '#EFF6FF',
    '#2563EB',
    { rotation: 0 }
  ))

  // Adiciona Lateral Caixa Direito
  generatedItems.push(makeItem(
    `catalog-81${lineSuffix}`,
    'Lateral Caixa',
    '📥',
    storeWidth - 0.26 - latCaixaW,
    balcaoY,
    latCaixaW,
    0.26,
    '#EFF6FF',
    '#2563EB',
    { rotation: 0 }
  ))

  // Largura disponível no meio para os Balcões e Caixa:
  // De x = 0.26 + latCaixaW (0.66) até x = storeWidth - 0.26 - latCaixaW
  const middleStart = 0.26 + latCaixaW // 0.66
  const middleEnd = storeWidth - 0.26 - latCaixaW
  const middleWidth = middleEnd - middleStart

  // Estações de atendimento alternadas: [BA (1.0m) + Caixa (0.6m)] = 1.6m por estação.
  // Colocamos caixas intercalados com os balcões conforme os exemplos reais de layout.
  const stationW = 1.6
  
  // Determinamos um número de caixas proporcional e seguro para o tamanho da loja
  let numStations = 1
  if (storeWidth > 10) {
    numStations = 3
  } else if (storeWidth > 6) {
    numStations = 2
  }
  
  // Garante que o número de estações cabe fisicamente na largura
  while (numStations > 1 && numStations * stationW > middleWidth) {
    numStations--
  }

  const stationsList: { type: 'BA' | 'CX', w: number }[] = []
  for (let i = 0; i < numStations; i++) {
    stationsList.push({ type: 'BA', w: 1.0 })
    stationsList.push({ type: 'CX', w: 0.6 })
  }
  
  // Se sobrar espaço para mais um balcão (1.0m), nós o adicionamos no fim
  if (middleWidth - numStations * stationW >= 1.0) {
    stationsList.push({ type: 'BA', w: 1.0 })
  }
  
  const groupWidth = stationsList.reduce((acc, curr) => acc + curr.w, 0)
  // Centraliza o grupo
  const groupXStart = middleStart + (middleWidth - groupWidth) / 2
  let currentGroupX = groupXStart

  stationsList.forEach(station => {
    if (station.type === 'CX') {
      generatedItems.push(makeItem(
        `catalog-61${lineSuffix}`,
        'Caixa',
        '💳',
        currentGroupX,
        balcaoY,
        0.6,
        0.4,
        '#D1FAE5',
        '#047857',
        { rotation: 0 }
      ))
    } else {
      const balcaoId = storeType === 'premium' ? `catalog-55${lineSuffix}` : `catalog-51${lineSuffix}`
      generatedItems.push(makeItem(
        balcaoId,
        'Balcão de Atendimento',
        '🏪',
        currentGroupX,
        balcaoY,
        1.0,
        0.4,
        '#DBEAFE',
        '#1D4ED8',
        { rotation: 0 }
      ))
    }
    currentGroupX += station.w
  })

  // ==========================================
  // 3. PAREDES LATERAIS (FLUXO DE PRODUTOS E CATEGORIAS)
  // ==========================================
  // Começam a y = 1.20 m (recuo da entrada)
  // Terminam a y = balcaoY - 1.00 m (corredor livre antes do balcão)
  const wallYStart = 1.20
  const wallYEnd = balcaoY - 1.00

  // Sequência de móveis nas paredes laterais (da entrada para o fundo):
  // 1. Perfumaria (catalog-11, largura 0.807m, profundidade 0.26m)
  // 2. Dermo (catalog-92, largura 0.5m, profundidade 0.26m)
  // 3. Maquiagem (catalog-121, largura 1.9m, profundidade 0.26m)
  // 4. Esmaltes (catalog-111, largura 1.9m, profundidade 0.26m)
  // 5. MIPs / OTC (catalog-41, largura 0.807m, profundidade 0.26m)
  
  // Parede Esquerda (x = 0.26, pois o fundo do armário encosta em x = 0. Profundidade = 0.26m)
  // Rotação: 90 graus (olhando para dentro/direita)
  // Nota: Para itens com rotation: 90, Konva rotaciona horário a partir do canto superior esquerdo (x, y).
  // Para caber na faixa [0, 0.26] e [y, y + largura], a coordenada X de inserção deve ser target_x + depth = 0 + 0.26 = 0.26.
  
  // Deixamos um espaço para o Freezer de Sorvete no início da Parede Esquerda (de y = 1.2 a y = 2.2)
  const freezerGap = 1.0
  
  const placeWallItems = (x: number, rotation: number, startY: number) => {
    let currentY = startY
    
    // Lista de móveis a colocar em ordem
    const wallSequence = [
      { id: 'catalog-11', name: 'Perfumaria', icon: '🌸', w: 0.807 },
      { id: 'catalog-11', name: 'Perfumaria', icon: '🌸', w: 0.807 },
      { id: 'catalog-92', name: 'Dermocosméticos', icon: '💄', w: 0.5 },
      { id: 'catalog-121', name: 'Expositor Maquiagem', icon: '💅', w: 0.5 },
      { id: 'catalog-111', name: 'Expositor Esmaltes', icon: '💅', w: 0.5 },
      // MIPs completando o restante até o fundo
      { id: 'catalog-41', name: 'Medicamentos MIP', icon: '💊', w: 0.807 },
      { id: 'catalog-41', name: 'Medicamentos MIP', icon: '💊', w: 0.807 },
      { id: 'catalog-41', name: 'Medicamentos MIP', icon: '💊', w: 0.807 },
      { id: 'catalog-41', name: 'Medicamentos MIP', icon: '💊', w: 0.807 },
    ]

    for (const item of wallSequence) {
      if (currentY + item.w > wallYEnd) break
      
      const yPos = rotation === 270 ? currentY + item.w : currentY

      // Verifica colisão com pilares/obstáculos antes de colocar
      if (!collidesWithObstacle(x, yPos, item.w, 0.26, rotation)) {
        const fullId = `${item.id}${lineSuffix}`
        generatedItems.push(makeItem(
          fullId,
          item.name,
          item.icon,
          x,
          yPos,
          item.w,
          0.26,
          '#FFF1F7',
          '#DB2777',
          { rotation, isWallItem: true }
        ))
      }
      currentY += item.w
    }
  }

  // Preenche Parede Esquerda
  placeWallItems(0.26, 90, wallYStart + freezerGap)

  // Preenche Parede Direita (x = storeWidth - 0.26, pois o fundo encosta em x = storeWidth. Profundidade = 0.26m)
  // Rotação: 270 graus (olhando para dentro/esquerda)
  // Para itens com rotation: 270, Konva rotaciona 270 graus horário.
  // Para caber na faixa [storeWidth - 0.26, storeWidth] e [y, y + largura], a coordenada X de inserção deve ser storeWidth - 0.26.
  placeWallItems(storeWidth - 0.26, 270, wallYStart)

  // ==========================================
  // 4. GÔNDOLAS CENTRAIS (ÁREA CENTRAL)
  // ==========================================
  // Corredor livre lateral de 1.00m de cada lado dos armários de parede (que têm 0.26m de profundidade)
  // x_min = 0.26 + 1.00 = 1.26
  // x_max = storeWidth - 0.26 - 1.00 = storeWidth - 1.26
  const centralWidth = (storeWidth - 1.26) - 1.26

  // Cada gôndola central tem profundidade 0.43m (a largura da gôndola vira sua profundidade ao rotacionar 90 graus)
  // Corredor entre colunas de gôndola = 1.00m
  // Fórmula: N * 0.43 + (N - 1) * 1.00 <= centralWidth  => N * 1.43 - 1.00 <= centralWidth => N <= (centralWidth + 1.00) / 1.43
  const numColumns = Math.max(0, Math.floor((centralWidth + 1.00) / 1.43))

  if (numColumns > 0) {
    const totalColumnsWidth = numColumns * 0.43 + (numColumns - 1) * 1.00
    const colXStart = 1.26 + (centralWidth - totalColumnsWidth) / 2

    for (let c = 0; c < numColumns; c++) {
      // Coordenada X da coluna. Como a gôndola será rotacionada em 90 graus, seu X de inserção deve ser colX + depth (0.43m)
      const targetColX = colXStart + c * 1.43
      const gondolaX = targetColX + 0.43

      // Distanciamento vertical das gôndolas
      // Começa a y = 1.20m (recuo da entrada)
      // Termina a y = balcaoY - 1.00m (corredor livre antes do balcão)
      let currentGondolaY = 1.20
      const maxGondolaY = balcaoY - 1.00

      while (currentGondolaY + 1.70 <= maxGondolaY) {
        // Escolhe o maior tamanho de gôndola que cabe
        let gondolaLen = 1.70
        let gondolaId = `catalog-31${lineSuffix}` // GOND 170

        if (currentGondolaY + 3.00 <= maxGondolaY) {
          gondolaLen = 3.00
          gondolaId = `catalog-33${lineSuffix}` // GOND 300
        } else if (currentGondolaY + 2.20 <= maxGondolaY) {
          gondolaLen = 2.20
          gondolaId = `catalog-32${lineSuffix}` // GOND 220
        }

        if (!collidesWithObstacle(gondolaX, currentGondolaY, gondolaLen, 0.43, 90)) {
          generatedItems.push(makeItem(
            gondolaId,
            'Gôndola Central',
            '📦',
            gondolaX,
            currentGondolaY,
            gondolaLen,
            0.43,
            '#FDF8F0',
            '#8B7355',
            { rotation: 90 }
          ))
        }

        // Corredor vertical entre gôndolas na mesma coluna = 1.00m
        currentGondolaY += gondolaLen + 1.00
      }
    }
  }

  // ==========================================
  // 5. TRATAMENTO DE PILARES E CESTÕES
  // ==========================================
  // Se houver pilares estruturais no meio da loja, adicionamos Cestões (catalog-71, 0.4m x 0.4m) ao redor deles
  const pillars = existingObstacles.filter(obs => obs.isPillar)
  
  pillars.forEach(pillar => {
    const px = pillar.x ?? 0
    const py = pillar.y ?? 0
    const pw = pillar.width ?? 0.3
    const ph = pillar.height ?? 0.3

    // Posições candidatas ao redor do pilar para colocar os Cestões (Norte, Sul, Leste, Oeste)
    const candidates = [
      { x: px + (pw - 0.4) / 2, y: py - 0.4 }, // Norte
      { x: px + (pw - 0.4) / 2, y: py + ph },  // Sul
      { x: px - 0.4, y: py + (ph - 0.4) / 2 }, // Oeste
      { x: px + pw, y: py + (ph - 0.4) / 2 },  // Leste
    ]

    candidates.forEach(cand => {
      // Verifica se o cestão fica dentro dos limites internos da farmácia (descontando paredes de 0.26m)
      const insideX = cand.x >= 0.26 && cand.x + 0.4 <= storeWidth - 0.26
      const insideY = cand.y >= 1.20 && cand.y + 0.4 <= balcaoY - 0.5
      
      if (insideX && insideY) {
        // Verifica se colide com algum item já gerado
        const collides = generatedItems.some(item => {
          const itemX = item.x ?? 0
          const itemY = item.y ?? 0
          const itemW = item.width ?? 0.4
          const itemH = item.height ?? 0.4
          
          // Tratamento de rotação para colisão básica
          const realW = item.rotation === 90 || item.rotation === 270 ? itemH : itemW
          const realH = item.rotation === 90 || item.rotation === 270 ? itemW : itemH
          
          let x1 = itemX
          let y1 = itemY
          if (item.rotation === 90) {
            x1 = itemX - realW
          } else if (item.rotation === 270) {
            x1 = itemX
          }

          return (
            cand.x < x1 + realW &&
            cand.x + 0.4 > x1 &&
            cand.y < y1 + realH &&
            cand.y + 0.4 > y1
          )
        })

        if (!collides) {
          generatedItems.push(makeItem(
            `catalog-71${lineSuffix}`,
            'Cestão Promocional',
            '🧺',
            cand.x,
            cand.y,
            0.4,
            0.4,
            '#FDF8F0',
            '#8B7355',
            { rotation: 0 }
          ))
        }
      }
    })
  })

  // === VALIDAÇÃO E ESTATÍSTICAS ===
  const validation = validateLayout(generatedItems, storeWidth, storeHeight, minCorridor)
  const messages = [...config.tips, ...validation.messages]

  return {
    items: generatedItems,
    messages,
    stats: {
      usedArea: generatedItems.reduce((a, i) => a + (i.width ?? 0) * (i.height ?? 0), 0).toFixed(1),
      totalArea: (storeWidth * storeHeight).toFixed(1),
      corridorMin: minCorridor,
    },
    valid: validation.valid,
  }
}

function makeItem(
  itemId: string,
  name: string,
  icon: string,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  stroke: string,
  extra: Partial<CanvasItem> = {},
): Partial<CanvasItem> {
  const template = getItemById(itemId)
  return {
    id: `ai_${uuidv4()}`,
    itemId,
    name: template?.name ?? name,
    icon: template?.icon ?? icon,
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
    width: template?.width ?? Math.round(w * 100) / 100,
    height: template?.height ?? Math.round(h * 100) / 100,
    fillColor: template?.fillColor ?? fill,
    strokeColor: template?.strokeColor ?? stroke,
    color: template?.color,
    rotation: 0,
    label: template?.name ?? name,
    price: template?.price,
    finish: template?.finish,
    code: template?.code,
    height3d: template?.height3d,
    ...extra,
  }
}

function validateLayout(
  items: Partial<CanvasItem>[],
  storeWidth: number,
  storeHeight: number,
  minCorridor: number,
): { valid: boolean; messages: string[] } {
  const messages: string[] = []
  let valid = true

  const usedArea = items.reduce((a, i) => a + (i.width ?? 0) * (i.height ?? 0), 0)
  const totalArea = storeWidth * storeHeight
  const rate = (usedArea / totalArea) * 100

  if (rate > 60) {
    messages.push('⚠️ Layout com mais de 60% de ocupação. Verifique se os corredores estão adequados.')
    valid = false
  }
  if (rate < 25) {
    messages.push('💡 Espaço subutilizado. Considere adicionar mais prateleiras ou displays.')
  }

  messages.push(`✅ Corredor mínimo recomendado: ${minCorridor}m (verifique visualmente no canvas)`)
  messages.push(`📐 Taxa de ocupação: ${rate.toFixed(0)}% do espaço total`)

  return { valid, messages }
}

// ─── AI Chat ──────────────────────────────────────────────────────────────────

const AI_RESPONSES: Record<string, string[]> = {
  greeting: [
    'Olá! Sou o Assistente de Layout da Projefarma. Como posso ajudar a planejar sua farmácia?',
    'Oi! Estou aqui para ajudar você a criar o layout ideal para sua farmácia. Pode perguntar!',
  ],
  layout: [
    'Para criar um bom layout de farmácia, considere: 1) Corredor principal de entrada, 2) Medicamentos ao fundo, 3) Produtos de alta rotação na zona quente (entrada).',
    'O layout ideal segue o fluxo natural do cliente: entrada → produtos de necessidade imediata → produtos complementares → medicamentos no fundo.',
  ],
  corredor: [
    'Segundo normas da ANVISA e acessibilidade (NBR 9050), os corredores de circulação devem ter no mínimo 1,20m de largura. Para farmácias premium, recomendo 1,50m.',
    'Para atender PCD (pessoas com deficiência), mantenha pelo menos um corredor principal de 1,50m de largura. Isso é exigência de acessibilidade.',
  ],
  pilar: [
    'Pilares podem ser aproveitados estrategicamente! Coloque gôndolas ou expositores adjacentes aos pilares para "escondê-los" e otimizar o espaço.',
    'Ao identificar pilares no layout, posicione os móveis de forma que os pilares fiquem no limite entre dois equipamentos, não no meio do corredor.',
  ],
  popular: [
    'Para farmácias populares, o foco é eficiência: gôndolas paralelas, balcão ao fundo, caixa próxima à saída. O cliente sabe o que quer e quer encontrar rápido.',
  ],
  premium: [
    'Farmácias premium devem criar uma experiência de compra. Dedique espaço generoso para perfumaria (30-40%), use ilhas para browsing e destaque os consultórios.',
  ],
  manipulacao: [
    'A área de manipulação exige separação física da área de vendas. A RDC 87/2008 da ANVISA regulamenta os requisitos da área técnica.',
  ],
  anvisa: [
    'As principais normas ANVISA para farmácias são: RDC 44/2009 (funcionamento), RDC 87/2008 (manipulação). Recomendo sempre consultar a vigilância sanitária local.',
  ],
  export: [
    'Você pode exportar seu layout como PNG ou PDF com relatório completo! Use o botão "Exportar" no menu superior.',
  ],
  default: [
    'Boa pergunta! Vou analisar o layout da sua loja. Lembre-se: a disposição dos produtos influencia diretamente as vendas. Posso sugerir um layout personalizado com o botão "Gerar Layout com IA"!',
    'Cada farmácia é única! Me fale mais sobre sua loja: qual o tipo (popular, premium, manipulação)? Quais produtos você quer destacar?',
    'Para otimizar seu layout, considere o fluxo de clientes, a visibilidade dos produtos e as normas de acessibilidade. Posso gerar uma sugestão automaticamente!',
  ],
}

export function getAIResponse(message: string, _context: Partial<AIContext> = {}): string {
  const lower = message.toLowerCase()

  if (lower.includes('oi') || lower.includes('olá') || lower.includes('bom dia') || lower.includes('boa tarde')) {
    return randomFrom(AI_RESPONSES.greeting)
  }
  if (lower.includes('corredor') || lower.includes('largura') || lower.includes('passagem')) {
    return randomFrom(AI_RESPONSES.corredor)
  }
  if (lower.includes('pilar') || lower.includes('coluna')) {
    return randomFrom(AI_RESPONSES.pilar)
  }
  if (lower.includes('popular') || lower.includes('simples')) {
    return randomFrom(AI_RESPONSES.popular)
  }
  if (lower.includes('premium') || lower.includes('luxo') || lower.includes('alto padrão')) {
    return randomFrom(AI_RESPONSES.premium)
  }
  if (lower.includes('manipulaç') || lower.includes('fórmula')) {
    return randomFrom(AI_RESPONSES.manipulacao)
  }
  if (lower.includes('anvisa') || lower.includes('norma') || lower.includes('legislação') || lower.includes('lei')) {
    return randomFrom(AI_RESPONSES.anvisa)
  }
  if (lower.includes('layout') || lower.includes('planta') || lower.includes('disposição')) {
    return randomFrom(AI_RESPONSES.layout)
  }
  if (lower.includes('export') || lower.includes('pdf') || lower.includes('imprimir')) {
    return randomFrom(AI_RESPONSES.export)
  }

  return randomFrom(AI_RESPONSES.default)
}

function randomFrom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)] ?? ''
}

export { STORE_TYPE_CONFIGS }
