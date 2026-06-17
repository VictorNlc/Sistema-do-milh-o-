import {
  WALL_SHELF_DEPTH,
  STANDARD_PASSAGE_WIDTH,
  CORNER_GAP_LIMIT,
  MEDICINE_SHELF_DEPTH,
  OPERATOR_SPACE,
  BALCAO_DEPTH,
  CESTAO_SIZE,
  FRALDA_WIDTH,
  FRALDA_DEPTH,
  ENTRANCE_ISLAND_OFFSET,
} from '../config/layoutDimensions';
// ============================================
// AI Layout Assistant — Rule-based + Layouts de Referência (SketchUp)
// Bug Fix: usa uuid real em vez de Math.random()
// ============================================

import { v4 as uuidv4 } from 'uuid'
import { getItemById } from '../data/items'
import { getRotatedBounds, checkAABBCollision } from '../utils/geometry'
import { findCompatibleReferenceLayouts } from './sketchupVision'
import type {
  StoreType,
  AILayoutResult,
  AILayoutZone,
  CanvasItem,
  ItemCategory,
  LayoutDensity,
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
    corridorMin: STANDARD_PASSAGE_WIDTH,
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
    corridorMin: STANDARD_PASSAGE_WIDTH,
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


export async function generateAILayout(
  storeWidth: number,
  storeHeight: number,
  storeType: StoreType,
  existingObstacles: Partial<CanvasItem>[] = [],
  density: LayoutDensity = 'normal',
): Promise<AILayoutResult> {
  const config = STORE_TYPE_CONFIGS[storeType] ?? STORE_TYPE_CONFIGS.popular

  // ─── Verificar se há layout de referência compatível (SketchUp) ────────────
  // DESABILITADO: Força o uso da lógica heurística de regras para que a estratégia de layout
  // (laterais caixa rotacionados, sem espaço vazio ao lado, etc.) seja aplicada a todos os tamanhos.
  /*
  const referenceLayouts = findCompatibleReferenceLayouts(storeType, storeWidth, storeHeight, BALCAO_DEPTH)
  if (referenceLayouts.length > 0) {
    const ref = referenceLayouts[0]
    const scaleX = storeWidth / ref.storeWidth
    const scaleY = storeHeight / ref.storeHeight

    // Escalar as posições dos itens do layout de referência para as novas dimensões sem alterar suas dimensões físicas (mantendo o catálogo real)
    const scaledItems: Partial<CanvasItem>[] = ref.items.map(item => {
      let targetX = item.x * scaleX
      let targetY = item.y * scaleY

      // Ajustar para garantir que o item caiba dentro da nova largura/altura
      targetX = Math.max(0, Math.min(targetX, storeWidth - item.width))
      targetY = Math.max(0, Math.min(targetY, storeHeight - item.height))

      return {
        ...item,
        id: `ai_ref_${uuidv4()}`,
        x: Math.round(targetX * 100) / 100,
        y: Math.round(targetY * 100) / 100,
        width: item.width,
        height: item.height,
      }
    })

    // Filtrar itens que ficaram fora dos limites
    const validItems = scaledItems.filter(item =>
      (item.x ?? 0) >= 0 &&
      (item.y ?? 0) >= 0 &&
      (item.x ?? 0) + (item.width ?? 0) <= storeWidth + 0.1 &&
      (item.y ?? 0) + (item.height ?? 0) <= storeHeight + 0.1
    )

    const refArea = (ref.storeWidth * ref.storeHeight).toFixed(1)
    const newArea = (storeWidth * storeHeight).toFixed(1)

    return {
      items: validItems,
      messages: [
        `🎨 Layout baseado em modelo real dos seus projetistas (${ref.name})`,
        `📀 Modelo original: ${ref.storeWidth}m×${ref.storeHeight}m (${refArea}m²) → adaptado para ${storeWidth}m×${storeHeight}m (${newArea}m²)`,
        `✅ ${validItems.length} itens posicionados com base no projeto do projetista`,
        ...config.tips.slice(0, 2),
      ],
      stats: {
        usedArea: validItems.reduce((a, i) => a + (i.width ?? 0) * (i.height ?? 0), 0).toFixed(1),
        totalArea: (storeWidth * storeHeight).toFixed(1),
        corridorMin: 1.0,
      },
      valid: true,
    }
  }
  */
  // ───────────────────────────────────────────────────────────────────────
  // Fallback: lógica original de geração por regras
  // ───────────────────────────────────────────────────────────────────────

  const isLargeStore = storeWidth * storeHeight > 100

  // Corridor size based on layout density option (Livre, Padrão, Apertado)
  let minCorridor = 1.00
  if (density === 'spacious') minCorridor = STANDARD_PASSAGE_WIDTH
  else if (density === 'compact') minCorridor = 1.00 // NBR 9050 accessibility requires at least 1.00m for wheelchairs

  // Force at least 1.00m for all stores (including <= 100m²) to guarantee wheelchair accessibility
  if (!isLargeStore) {
    minCorridor = 1.00
  }

  // Verificar se há uma porta de entrada
  const hasDoor = existingObstacles.some(i => i.isDoor || i.itemId?.includes('door') || i.itemId?.includes('porta') || i.name?.toLowerCase().includes('entrada'));
  if (!hasDoor) {
    return {
      items: [],
      messages: ['⚠️ Adicione uma porta de entrada ao canvas antes de gerar o layout.'],
      valid: false,
      stats: { usedArea: '0', totalArea: (storeWidth * storeHeight).toFixed(1), corridorMin: minCorridor },
    };
  }

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

  // Helper para verificar colisões com pilares/obstáculos/portas e itens já gerados
  const collidesWithObstacle = (x: number, y: number, w: number, h: number, rot: number) => {
    const boxA = getRotatedBounds(x, y, w, h, rot)

    // 1. Verificar contra obstáculos estáticos da loja (margem de 5cm)
    const collidesObstacle = existingObstacles.some(obs => {
      if (!obs.isPillar && !obs.isObstacle && !obs.isDoor) return false

      const ox = obs.x ?? 0
      const oy = obs.y ?? 0
      const ow = obs.width ?? 0.3
      const oh = obs.height ?? 0.3
      const oRot = obs.rotation ?? 0

      const boxB = getRotatedBounds(ox, oy, ow, oh, oRot)

      return (
        boxA.x < boxB.x + boxB.width + 0.05 &&
        boxA.x + boxA.width > boxB.x - 0.05 &&
        boxA.y < boxB.y + boxB.height + 0.05 &&
        boxA.y + boxA.height > boxB.y - 0.05
      )
    })

    if (collidesObstacle) return true

    // 2. Verificar contra itens já posicionados no layout (tolerância de 1cm para permitir encostar)
    const collidesGenerated = generatedItems.some(item => {
      const ix = item.x ?? 0
      const iy = item.y ?? 0
      const iw = item.width ?? 0.3
      const ih = item.height ?? 0.3
      const iRot = item.rotation ?? 0

      const boxB = getRotatedBounds(ix, iy, iw, ih, iRot)

      return (
        boxA.x < boxB.x + boxB.width - 0.01 &&
        boxA.x + boxA.width > boxB.x + 0.01 &&
        boxA.y < boxB.y + boxB.height - 0.01 &&
        boxA.y + boxA.height > boxB.y + 0.01
      )
    })

    return collidesGenerated
  }

  const lineSuffix = storeType === 'premium' ? '-premium' : '-especial'

  // 1. Detectar ou criar portas (entrada e saída)
  const doors = existingObstacles.filter(i => i.isDoor || i.itemId?.includes('door') || i.itemId?.includes('porta'))
  let entrance = doors.find(i => i.itemId === 'porta-entrada' || i.name?.toLowerCase().includes('entrada'))
  let exit = doors.find(i => i.itemId === 'porta-saida-emergencia' || i.name?.toLowerCase().includes('saida') || i.isEmergency)

  if (!entrance) {
    const entX = Math.max(0.5, storeWidth / 2 - CORNER_GAP_LIMIT)
    const entY = storeHeight - 0.15
    const newEnt = makeItem(
      'porta-entrada',
      'Porta de Entrada',
      '🚪',
      entX,
      entY,
      STANDARD_PASSAGE_WIDTH,
      0.15,
      '#FCD34D',
      '#78350F',
      { rotation: 0 }
    )
    generatedItems.push(newEnt)
    entrance = newEnt
  }

  if (!exit) {
    const extX = Math.min(storeWidth - 1.5, storeWidth / 2 + CORNER_GAP_LIMIT)
    const extY = storeHeight - 0.15
    const newExt = makeItem(
      'porta-saida-emergencia',
      'Saída de Emergência',
      '🆘',
      extX,
      extY,
      1.0,
      0.15,
      '#FCA5A5',
      '#991B1B',
      { rotation: 0 }
    )
    generatedItems.push(newExt)
    exit = newExt
  }

  // 2. Determinar parede da entrada e parede oposta (rxWall)
  let entranceWall: 'Top' | 'Bottom' | 'Left' | 'Right' = 'Bottom'
  if (entrance) {
    const ex = entrance.x ?? 0
    const ey = entrance.y ?? 0
    const distTop = ey
    const distBottom = storeHeight - ey
    const distLeft = ex
    const distRight = storeWidth - ex

    const minDist = Math.min(distTop, distBottom, distLeft, distRight)
    if (minDist === distTop) entranceWall = 'Top'
    else if (minDist === distBottom) entranceWall = 'Bottom'
    else if (minDist === distLeft) entranceWall = 'Left'
    else entranceWall = 'Right'
  }

  let rxWall: 'Top' | 'Bottom' | 'Left' | 'Right' = 'Bottom'
  if (entranceWall === 'Bottom') rxWall = 'Top'
  else if (entranceWall === 'Top') rxWall = 'Bottom'
  else if (entranceWall === 'Left') rxWall = 'Right'
  else rxWall = 'Left'

  // Chamada para posicionar os expositores de vitrine na parede de entrada (movida para o fim)

  // Variáveis para controlar os limites centrais (corredores baseados na densidade)
  const sideOffset = WALL_SHELF_DEPTH + minCorridor
  let centralMinX = sideOffset
  let centralMaxX = storeWidth - sideOffset
  let centralMinY = sideOffset
  let centralMaxY = storeHeight - sideOffset

  const medShelfDepth = MEDICINE_SHELF_DEPTH
  const operatorSpace = OPERATOR_SPACE
  const balcaoDepth = BALCAO_DEPTH
  const latCaixaW = CESTAO_SIZE

  // Helper para posicionar gôndolas em layout horizontal (rxWall = Top ou Bottom)
  const placeHorizontalLayoutGondolas = (yStart: number, yEnd: number) => {
    const leftLimit = WALL_SHELF_DEPTH
    const rightLimit = storeWidth - WALL_SHELF_DEPTH
    const availableWidth = rightLimit - leftLimit
    
    let numColumns = 0
    let safetyCounter1 = 0;
    while (safetyCounter1++ < 500) {
      const nextNum = numColumns + 1
      const nextCorridor = (availableWidth - nextNum * 0.43) / (nextNum + 1)
      if (nextCorridor >= minCorridor) {
        numColumns = nextNum
      } else {
        break
      }
    }
    
    if (numColumns === 0) return

    const innerCorridor = numColumns > 1
      ? (availableWidth - 2 * minCorridor - numColumns * 0.43) / (numColumns - 1)
      : (availableWidth - 0.43) / 2

    for (let c = 0; c < numColumns; c++) {
      const gondolaLeft = numColumns > 1
        ? leftLimit + minCorridor + c * (0.43 + innerCorridor)
        : leftLimit + innerCorridor
      const gondolaX = gondolaLeft + 0.43 // rotation 90, so group X is right edge

      const minY = Math.min(yStart, yEnd)
      const maxY = Math.max(yStart, yEnd)
      const availableHeight = maxY - minY

      let rowLengths: number[] = []
      if (availableHeight >= 3.00 + 3.00 + minCorridor) {
        rowLengths = [3.00, 3.00]
      } else if (availableHeight >= 2.20 + 2.20 + minCorridor) {
        rowLengths = [2.20, 2.20]
      } else if (availableHeight >= 1.70 + 1.70 + minCorridor) {
        rowLengths = [1.70, 1.70]
      } else if (availableHeight >= 3.00) {
        rowLengths = [3.00]
      } else if (availableHeight >= 2.20) {
        rowLengths = [2.20]
      } else if (availableHeight >= 1.70) {
        rowLengths = [1.70]
      }

      const numRows = rowLengths.length
      if (numRows > 0) {
        const totalGondolaLength = rowLengths.reduce((sum, len) => sum + len, 0)
        
        if (numRows === 1) {
          const currentY = minY + (availableHeight - totalGondolaLength) / 2
          const gondolaLen = rowLengths[0]
          let gondolaId = `catalog-31${lineSuffix}`
          if (gondolaLen === 3.00) gondolaId = `catalog-33${lineSuffix}`
          else if (gondolaLen === 2.20) gondolaId = `catalog-32${lineSuffix}`

          if (!collidesWithObstacle(gondolaX, currentY, gondolaLen, 0.43, 90)) {
            generatedItems.push(makeItem(
              gondolaId,
              'Gôndola Central',
              '📦',
              gondolaX,
              currentY,
              gondolaLen,
              0.43,
              '#FDF8F0',
              '#8B7355',
              { rotation: 90 }
            ))
          }
        } else {
          const gapY = numRows > 1
            ? Math.min(minCorridor * 1.15, (availableHeight - totalGondolaLength) / (numRows - 1))
            : minCorridor
          let currentY = minY
          for (let r = 0; r < numRows; r++) {
            const gondolaLen = rowLengths[r]
            let gondolaId = `catalog-31${lineSuffix}`
            if (gondolaLen === 3.00) gondolaId = `catalog-33${lineSuffix}`
            else if (gondolaLen === 2.20) gondolaId = `catalog-32${lineSuffix}`

            if (!collidesWithObstacle(gondolaX, currentY, gondolaLen, 0.43, 90)) {
              generatedItems.push(makeItem(
                gondolaId,
                'Gôndola Central',
                '📦',
                gondolaX,
                currentY,
                gondolaLen,
                0.43,
                '#FDF8F0',
                '#8B7355',
                { rotation: 90 }
              ))
            }
            currentY += gondolaLen + gapY
          }

          // Check if we can place a promotional basket or smaller unit at the bottom of the column
          const leftoverY = maxY - currentY
          if (leftoverY >= BALCAO_DEPTH) {
            const basketX = gondolaX - 0.43 + 0.015 // center horizontally in the 0.43m wide column projection
            if (!collidesWithObstacle(basketX, currentY, BALCAO_DEPTH, BALCAO_DEPTH, 0)) {
              generatedItems.push(makeItem(
                `catalog-71${lineSuffix}`,
                'Cestão Promocional',
                '🧺',
                basketX,
                currentY,
                BALCAO_DEPTH,
                BALCAO_DEPTH,
                '#FDF8F0',
                '#8B7355',
                { rotation: 0 }
              ))
            }
          }
        }
      }
    }
  }

  // Helper para posicionar gôndolas em layout vertical (rxWall = Left ou Right)
  const placeVerticalLayoutGondolas = (xStart: number, xEnd: number) => {
    const topLimit = WALL_SHELF_DEPTH
    const bottomLimit = storeHeight - WALL_SHELF_DEPTH
    const availableHeight = bottomLimit - topLimit
    
    let numRows = 0
    let safetyCounter2 = 0;
    while (safetyCounter2++ < 500) {
      const nextNum = numRows + 1
      const nextCorridor = (availableHeight - nextNum * 0.43) / (nextNum + 1)
      if (nextCorridor >= minCorridor) {
        numRows = nextNum
      } else {
        break
      }
    }

    if (numRows === 0) return

    const innerCorridorY = numRows > 1
      ? (availableHeight - 2 * minCorridor - numRows * 0.43) / (numRows - 1)
      : (availableHeight - 0.43) / 2

    for (let r = 0; r < numRows; r++) {
      const gondolaY = numRows > 1
        ? topLimit + minCorridor + r * (0.43 + innerCorridorY)
        : topLimit + innerCorridorY

      const minX = Math.min(xStart, xEnd)
      const maxX = Math.max(xStart, xEnd)
      const availableWidth = maxX - minX

      let colLengths: number[] = []
      if (availableWidth >= 3.00 + 3.00 + minCorridor) {
        colLengths = [3.00, 3.00]
      } else if (availableWidth >= 2.20 + 2.20 + minCorridor) {
        colLengths = [2.20, 2.20]
      } else if (availableWidth >= 1.70 + 1.70 + minCorridor) {
        colLengths = [1.70, 1.70]
      } else if (availableWidth >= 3.00) {
        colLengths = [3.00]
      } else if (availableWidth >= 2.20) {
        colLengths = [2.20]
      } else if (availableWidth >= 1.70) {
        colLengths = [1.70]
      }

      const numCols = colLengths.length
      if (numCols > 0) {
        const totalGondolaLength = colLengths.reduce((sum, len) => sum + len, 0)
        
        if (numCols === 1) {
          const currentX = minX + (availableWidth - totalGondolaLength) / 2
          const gondolaLen = colLengths[0]
          let gondolaId = `catalog-31${lineSuffix}`
          if (gondolaLen === 3.00) gondolaId = `catalog-33${lineSuffix}`
          else if (gondolaLen === 2.20) gondolaId = `catalog-32${lineSuffix}`

          if (!collidesWithObstacle(currentX, gondolaY, gondolaLen, 0.43, 0)) {
            generatedItems.push(makeItem(
              gondolaId,
              'Gôndola Central',
              '📦',
              currentX,
              gondolaY,
              gondolaLen,
              0.43,
              '#FDF8F0',
              '#8B7355',
              { rotation: 0 }
            ))
          }
        } else {
          const gapX = numCols > 1
            ? Math.min(minCorridor * 1.15, (availableWidth - totalGondolaLength) / (numCols - 1))
            : minCorridor
          let currentX = minX
          for (let c = 0; c < numCols; c++) {
            const gondolaLen = colLengths[c]
            let gondolaId = `catalog-31${lineSuffix}`
            if (gondolaLen === 3.00) gondolaId = `catalog-33${lineSuffix}`
            else if (gondolaLen === 2.20) gondolaId = `catalog-32${lineSuffix}`

            if (!collidesWithObstacle(currentX, gondolaY, gondolaLen, 0.43, 0)) {
              generatedItems.push(makeItem(
                gondolaId,
                'Gôndola Central',
                '📦',
                currentX,
                gondolaY,
                gondolaLen,
                0.43,
                '#FDF8F0',
                '#8B7355',
                { rotation: 0 }
              ))
            }
            currentX += gondolaLen + gapX
          }

          // Check if we can place a promotional basket or smaller unit at the right of the row
          const leftoverX = maxX - currentX
          if (leftoverX >= BALCAO_DEPTH) {
            const basketY = gondolaY + 0.015 // center vertically in the 0.43m wide row projection
            if (!collidesWithObstacle(currentX, basketY, BALCAO_DEPTH, BALCAO_DEPTH, 0)) {
              generatedItems.push(makeItem(
                `catalog-71${lineSuffix}`,
                'Cestão Promocional',
                '🧺',
                currentX,
                basketY,
                BALCAO_DEPTH,
                BALCAO_DEPTH,
                '#FDF8F0',
                '#8B7355',
                { rotation: 0 }
              ))
            }
          }
        }
      }
    }
  }

  // Helper para prateleiras de medicamentos nas paredes laterais (wrap-around)
  const placeWrapAroundShelves = (
    fixedCoord: number,
    axis: 'x' | 'y',
    rot: number,
    startVal: number,
    endVal: number,
    sign: number
  ) => {
    const oppSign = -sign
    const totalDist = Math.max(0, Math.abs(endVal - startVal) - BALCAO_DEPTH)
    let currentVal = endVal + oppSign * BALCAO_DEPTH

    // We want to force MED 807 (catalog-21) and MED 500 (catalog-22) next to the counter
    const hasSpaceForForced = totalDist >= 1.307

    const forcedSequence = hasSpaceForForced
      ? [
          { id: 'catalog-21', name: 'Prateleira Medicamentos', icon: '💊', w: 0.807 },
          { id: 'catalog-22', name: 'Prateleira Medicamentos', icon: '💊', w: 0.5 },
        ]
      : []

    const normalSequence = [
      { id: 'catalog-23', name: 'Prateleira Medicamentos', icon: '💊', w: 1.0 },
      { id: 'catalog-21', name: 'Prateleira Medicamentos', icon: '💊', w: 0.807 },
      { id: 'catalog-22', name: 'Prateleira Medicamentos', icon: '💊', w: 0.5 },
    ]

    let forcedIndex = 0

    let safetyCounter3 = 0;
    while (safetyCounter3++ < 500) {
      const remaining = oppSign === 1 ? (startVal - currentVal) : (currentVal - startVal)
      if (remaining <= 0.01) break

      let item = null
      if (forcedIndex < forcedSequence.length) {
        const candidate = forcedSequence[forcedIndex]
        if (candidate.w <= remaining + 0.001) {
          item = candidate
          forcedIndex++
        } else {
          forcedIndex = forcedSequence.length
        }
      }

      if (!item) {
        const fitting = normalSequence.filter(m => m.w <= remaining + 0.001)
        if (fitting.length === 0) break
        item = fitting[0]
      }

      const itemVal = getPos(currentVal, item.w, rot, oppSign)
      const posX = axis === 'x' ? itemVal : fixedCoord
      const posY = axis === 'y' ? itemVal : fixedCoord
      
      const itemW = item.w
      const itemH = MEDICINE_SHELF_DEPTH

      if (!collidesWithObstacle(posX, posY, itemW, itemH, rot)) {
        generatedItems.push(makeItem(
          `${item.id}${lineSuffix}`,
          item.name,
          item.icon,
          posX,
          posY,
          itemW,
          itemH,
          '#FDF8F0',
          '#8B7355',
          { rotation: rot, isWallItem: true }
        ))
      }
      currentVal += oppSign * item.w
    }
  }

  // Helper para expositores das laterais (Perfumaria, MIPs)
  const placeWallSequence = (
    fixedCoord: number,
    axis: 'x' | 'y',
    rot: number,
    startVal: number,
    endVal: number,
    sign: number,
    extraGap: number = 0
  ) => {
    let currentVal = startVal + sign * extraGap
    const preferredSequence = [
      { id: 'catalog-11', name: 'Perfumaria', icon: '🌸', w: 0.807 },
      { id: 'catalog-11', name: 'Perfumaria', icon: '🌸', w: 0.807 },
      { id: 'catalog-92', name: 'Dermocosméticos', icon: '💄', w: 0.5 },
      { id: 'catalog-121', name: 'Expositor Maquiagem', icon: '💅', w: 0.5 },
      { id: 'catalog-111', name: 'Expositor Esmaltes', icon: '💅', w: 0.5 },
      { id: 'catalog-41', name: 'Medicamentos MIP', icon: '💊', w: 0.807 },
      { id: 'catalog-41', name: 'Medicamentos MIP', icon: '💊', w: 0.807 },
      { id: 'catalog-41', name: 'Medicamentos MIP', icon: '💊', w: 0.807 },
      { id: 'catalog-41', name: 'Medicamentos MIP', icon: '💊', w: 0.807 },
      { id: 'catalog-41', name: 'Medicamentos MIP', icon: '💊', w: 0.807 },
      { id: 'catalog-41', name: 'Medicamentos MIP', icon: '💊', w: 0.807 },
    ]

    const fallbacks = [
      { id: 'catalog-92', name: 'Dermocosméticos', icon: '💄', w: 0.5 },
      { id: 'catalog-42', name: 'Medicamentos MIP', icon: '💊', w: 0.5 },
    ]

    let seqIndex = 0
    let safetyCounter4 = 0;
    while (safetyCounter4++ < 500) {
      const remaining = sign === 1 ? (endVal - currentVal) : (currentVal - endVal)
      if (remaining <= 0.01) break

      let item = preferredSequence[seqIndex]
      if (!item || item.w > remaining + 0.001) {
        const fittingFallback = fallbacks.find(f => f.w <= remaining + 0.001)
        if (fittingFallback) {
          item = fittingFallback
        } else {
          break
        }
      }

      const itemVal = getPos(currentVal, item.w, rot, sign)
      const posX = axis === 'x' ? itemVal : fixedCoord
      const posY = axis === 'y' ? itemVal : fixedCoord
      
      const itemW = item.w
      const itemH = WALL_SHELF_DEPTH

      if (!collidesWithObstacle(posX, posY, itemW, itemH, rot)) {
        generatedItems.push(makeItem(
          `${item.id}${lineSuffix}`,
          item.name,
          item.icon,
          posX,
          posY,
          itemW,
          itemH,
          '#FFF1F7',
          '#DB2777',
          { rotation: rot, isWallItem: true }
        ))
      }
      currentVal += sign * item.w
      seqIndex++
    }
  }

  // ─── Sequências específicas de parede (esquerda: MIP+fralda / direita: beleza) ───
  interface WallSeqItem {
    id: string; name: string; icon: string; w: number; depth?: number; color?: string; stroke?: string
  }

  const placeSmartWallSequence = (
    fixedCoord: number,
    axis: 'x' | 'y',
    rot: number,
    startVal: number,
    endVal: number,
    sign: number,
    prefix: WallSeqItem[],
    suffix: WallSeqItem[] = [],
    extraGap: number = 0,
  ) => {
    const fillSeq: WallSeqItem[] = [
      { id: 'catalog-11', name: 'Perfumaria', icon: '🌸', w: 0.807, color: '#FFF1F7', stroke: '#DB2777' },
      { id: 'catalog-13', name: 'Perfumaria 550', icon: '🌸', w: 0.55, color: '#FFF1F7', stroke: '#DB2777' },
    ]

    const placeOne = (item: WallSeqItem, val: number) => {
      const d = item.depth ?? WALL_SHELF_DEPTH
      // For left/right wall items (rot=90/270), adjust fixedCoord so item stays against the wall
      // rot=90 (left wall): item extends LEFT by depth from posX → posX must equal depth
      // rot=270 (right wall): item extends RIGHT by depth from posX → posX must equal storeWidth-depth
      let adjusted = fixedCoord
      if (rot === 90) adjusted = d
      else if (rot === 270) adjusted = fixedCoord + (WALL_SHELF_DEPTH - d)
      const itemVal = getPos(val, item.w, rot, sign)
      const posX = axis === 'x' ? itemVal : adjusted
      const posY = axis === 'y' ? itemVal : adjusted
      if (!collidesWithObstacle(posX, posY, item.w, d, rot)) {
        generatedItems.push(makeItem(
          `${item.id}${lineSuffix}`,
          item.name, item.icon, posX, posY,
          item.w, d,
          item.color ?? '#FFF1F7', item.stroke ?? '#DB2777',
          { rotation: rot, isWallItem: true },
        ))
      }
    }

    const suffixSpace = suffix.reduce((s, i) => s + i.w, 0)
    const fillEnd = sign > 0 ? endVal - suffixSpace : endVal + suffixSpace

    // 1. Prefix (near counter)
    let cur = startVal + sign * extraGap
    for (const item of prefix) {
      const rem = sign > 0 ? fillEnd - cur : cur - fillEnd
      if (rem <= 0.001) break
      if (item.w > rem + 0.001) continue
      placeOne(item, cur)
      cur += sign * item.w
    }

    // 2. Fill with perfumaria up to fillEnd
    let safety = 0
    while (safety++ < 300) {
      const rem = sign > 0 ? fillEnd - cur : cur - fillEnd
      if (rem <= 0.001) break
      const item = fillSeq.find(f => f.w <= rem + 0.001)
      if (!item) break
      placeOne(item, cur)
      cur += sign * item.w
    }

    // 3. Suffix placed right where fill stopped — no gap between fill and suffix
    // (any leftover space ends up at the entrance-side end, not between fill and fraldas)
    let sufCur = cur
    for (const item of suffix) {
      const rem = sign > 0 ? endVal - sufCur : sufCur - endVal
      if (rem <= 0.001 || item.w > rem + 0.001) break
      placeOne(item, sufCur)
      sufCur += sign * item.w
    }
  }

  // Definições das sequências fixas por parede
  const MIP_AMARELO: WallSeqItem = { id: 'catalog-43', name: 'MIP Dor e Febre', icon: '💊', w: 0.5, color: '#FFFBEB', stroke: '#D97706' }
  const MIP_VERMELHO: WallSeqItem = { id: 'catalog-44', name: 'MIP Gripe e Alergia', icon: '💊', w: 0.5, color: '#FEF2F2', stroke: '#DC2626' }
  const MIP_AZUL: WallSeqItem = { id: 'catalog-45', name: 'MIP Sist. Digestivo', icon: '💊', w: 0.5, color: '#EFF6FF', stroke: '#2563EB' }
  const PF_CANAL: WallSeqItem = { id: 'catalog-14', name: 'PF Canaletado', icon: '🌸', w: 0.807, color: '#FFF1F7', stroke: '#DB2777' }
  const DERMO: WallSeqItem = { id: 'catalog-92', name: 'Dermocosméticos', icon: '💄', w: 0.5, color: '#F8FAFC', stroke: '#1C1917' }
  const ESMALTE: WallSeqItem = { id: 'catalog-111', name: 'Esmaltes', icon: '💅', w: 0.5, color: '#FDF4FF', stroke: '#9333EA' }
  const MAQUIAGEM: WallSeqItem = { id: 'catalog-121', name: 'Maquiagem', icon: '💄', w: 0.5, color: '#FFF0F6', stroke: '#EC4899' }
  const FRALDA_ITEM: WallSeqItem = { id: 'catalog-181', name: 'Fraldas', icon: '👶', w: FRALDA_WIDTH, depth: FRALDA_DEPTH, color: '#EEF2FF', stroke: '#4338CA' }
  const PAINEL_CANAL: WallSeqItem = { id: 'catalog-141', name: 'Painel Canaletado', icon: '🌸', w: 0.807, color: '#FFF1F7', stroke: '#DB2777' }

  const LEFT_PREFIX: WallSeqItem[] = [MIP_AMARELO, MIP_VERMELHO, MIP_AZUL, PF_CANAL]
  const LEFT_SUFFIX: WallSeqItem[] = [FRALDA_ITEM, FRALDA_ITEM]
  const RIGHT_PREFIX: WallSeqItem[] = [DERMO, ESMALTE, MAQUIAGEM, PF_CANAL]

  // Helper: ilha de cestões na entrada (1.2m após a parede de entrada)
  const placeEntranceIsland = (
    entranceWallAxis: 'x' | 'y',
    entranceEdgeVal: number,
    crossAxis: 'x' | 'y',
    crossCenter: number,
    towardInteriorSign: number,
    checkoutCrossMin?: number,
    checkoutCrossMax?: number,
  ) => {
    const area = storeWidth * storeHeight
    const numCols = Math.max(2, Math.min(3, Math.floor(Math.min(1.2, storeWidth - 2 * minCorridor) / CESTAO_SIZE)))
    const numRows = area >= 60 ? 2 : 1
    const islandW = numCols * CESTAO_SIZE
    const storeSize = entranceWallAxis === 'y' ? storeWidth : storeHeight
    let islandCrossStart = Math.max(minCorridor, Math.min(
      storeSize - minCorridor - islandW,
      crossCenter - islandW / 2,
    ))

    if (checkoutCrossMin !== undefined && checkoutCrossMax !== undefined) {
      const islandEnd = islandCrossStart + islandW
      const clearLeft = checkoutCrossMin - minCorridor
      const clearRight = checkoutCrossMax + minCorridor
      if (islandEnd > clearLeft && islandCrossStart < clearRight) {
        const rEnd = storeSize - minCorridor
        if (rEnd - clearRight >= islandW) {
          islandCrossStart = clearRight + (rEnd - clearRight - islandW) / 2
        } else if (clearLeft - minCorridor >= islandW) {
          islandCrossStart = minCorridor + (clearLeft - minCorridor - islandW) / 2
        }
      }
    }

    let islandEdge = entranceEdgeVal + towardInteriorSign * ENTRANCE_ISLAND_OFFSET
    if (towardInteriorSign === -1) {
      islandEdge -= CESTAO_SIZE
    }

    for (let row = 0; row < numRows; row++) {
      for (let col = 0; col < numCols; col++) {
        const crossVal = islandCrossStart + col * CESTAO_SIZE
        const depthVal = islandEdge + towardInteriorSign * row * CESTAO_SIZE
        const cx = crossAxis === 'x' ? crossVal : depthVal
        const cy = crossAxis === 'x' ? depthVal : crossVal
        if (!collidesWithObstacle(cx, cy, CESTAO_SIZE, CESTAO_SIZE, 0)) {
          generatedItems.push(makeItem(
            `catalog-71${lineSuffix}`, 'Cestão Promocional', '🧺',
            cx, cy, CESTAO_SIZE, CESTAO_SIZE, '#FDF8F0', '#8B7355', { rotation: 0 },
          ))
        }
      }
    }
  }

  // Helper: itens ao redor do checkout em L (painel + vitrine, sem cestões)
  // O painel canaletado SEMPRE fica grudado na parede de entrada (parede do cliente),
  // diretamente atrás do módulo de checkout L.
  const placeCheckoutSurroundings = (
    checkoutX: number,
    checkoutY: number,
    checkoutRot: number,
    placeOnLeft: boolean,
    rxWall: string,
  ) => {
    if (rxWall === 'Top') {
      // Entrada em y=storeHeight (parede sul). Painel grudado nessa parede, atrás do checkout L.
      // Checkout rot=90 ocupa x=checkoutX-1.2..checkoutX. Painel alinhado à esquerda: x=checkoutX-1.2..checkoutX-0.393.
      // rot=180 em (checkoutX-STANDARD_PASSAGE_WIDTH+PAINEL_CANAL.w, storeHeight).
      generatedItems.push(makeItem(
        `catalog-141${lineSuffix}`, 'Painel Canaletado', '🌸',
        checkoutX - STANDARD_PASSAGE_WIDTH + PAINEL_CANAL.w, storeHeight, WALL_SHELF_DEPTH, PAINEL_CANAL.w, '#FFF1F7', '#DB2777', { rotation: 180, isWallItem: true },
      ))
    } else if (rxWall === 'Bottom') {
      // Entrada em y=0 (parede norte). Painel grudado nessa parede, atrás do checkout L.
      // Checkout rot=180 ocupa x=checkoutX-1.2..checkoutX. Painel alinhado à esquerda: x=checkoutX-1.2..checkoutX-0.393.
      // rot=0 em (checkoutX-STANDARD_PASSAGE_WIDTH, 0): ocupa x=checkoutX-1.2..checkoutX-0.393, y=0..0.26.
      generatedItems.push(makeItem(
        `catalog-141${lineSuffix}`, 'Painel Canaletado', '🌸',
        checkoutX - STANDARD_PASSAGE_WIDTH, 0, WALL_SHELF_DEPTH, PAINEL_CANAL.w, '#FFF1F7', '#DB2777', { rotation: 0, isWallItem: true },
      ))
    } else if (rxWall === 'Left') {
      // Entrada em x=storeWidth (parede leste). Painel grudado nessa parede, atrás do checkout L.
      // Checkout rot=270 ocupa y=checkoutY-1.2..checkoutY. Painel alinhado à esquerda: y=checkoutY-1.2..checkoutY-0.393.
      // rot=90 em (storeWidth, checkoutY-STANDARD_PASSAGE_WIDTH): ocupa x=storeWidth-0.26..storeWidth, y=checkoutY-1.2..checkoutY-0.393.
      const painelY = checkoutY - STANDARD_PASSAGE_WIDTH
      generatedItems.push(makeItem(
        `catalog-141${lineSuffix}`, 'Painel Canaletado', '🌸',
        storeWidth, painelY, WALL_SHELF_DEPTH, PAINEL_CANAL.w, '#FFF1F7', '#DB2777', { rotation: 90, isWallItem: true },
      ))
    } else { // Right — entrada em x=0 (parede oeste)
      // Checkout rot=90 ocupa y=checkoutY..checkoutY+1.2. Painel em y=checkoutY..checkoutY+0.807.
      // rot=90 em (WALL_SHELF_DEPTH, checkoutY): ocupa x=0..0.26, y=checkoutY..checkoutY+0.807.
      const painelY = checkoutY
      generatedItems.push(makeItem(
        `catalog-141${lineSuffix}`, 'Painel Canaletado', '🌸',
        WALL_SHELF_DEPTH, painelY, WALL_SHELF_DEPTH, PAINEL_CANAL.w, '#FFF1F7', '#DB2777', { rotation: 90, isWallItem: true },
      ))
    }
  }

  // Helper para posicionar os expositores de vitrine (catalog-15) na parede de entrada.
  // Coloca no máximo 2 de cada lado da porta de entrada.
  // No lado esquerdo (menor coordenada), coloca apenas se houver espaço livre.
  function placeVitrinesOnEntranceWall() {
    if (!entrance) return

    const gap = 0.05 // gap de segurança da porta
    const vitrineW = 0.807
    const vitrineH = WALL_SHELF_DEPTH // 0.26

    const ex = entrance.x ?? 0
    const ey = entrance.y ?? 0
    const ew = entrance.width ?? 2.0
    const eh = entrance.height ?? 0.15

    if (entranceWall === 'Bottom') {
      const wallY = storeHeight

      // Lado Direito (Maior X) - Começa no canto direito e vai em direção à porta
      for (let i = 0; i < 2; i++) {
        const pivotX = storeWidth - i * vitrineW
        const startX = pivotX - vitrineW
        if (startX >= ex + ew + gap) {
          if (!collidesWithObstacle(pivotX, wallY, vitrineW, vitrineH, 180)) {
            generatedItems.push(makeItem(
              `catalog-15${lineSuffix}`, 'Vitrine PF', '✨',
              pivotX, wallY, vitrineW, vitrineH,
              '#F0F9FF', '#0369A1',
              { rotation: 180, isWallItem: true }
            ))
          }
        }
      }

      // Lado Esquerdo (Menor X) - Começa no canto esquerdo e vai em direção à porta (apenas se houver espaço livre)
      for (let i = 0; i < 2; i++) {
        const pivotX = (i + 1) * vitrineW
        const startX = pivotX - vitrineW
        if (pivotX <= ex - gap) {
          if (!collidesWithObstacle(pivotX, wallY, vitrineW, vitrineH, 180)) {
            generatedItems.push(makeItem(
              `catalog-15${lineSuffix}`, 'Vitrine PF', '✨',
              pivotX, wallY, vitrineW, vitrineH,
              '#F0F9FF', '#0369A1',
              { rotation: 180, isWallItem: true }
            ))
          }
        }
      }
    } else if (entranceWall === 'Top') {
      const wallY = 0

      // Lado Direito (Maior X) - Começa no canto direito e vai em direção à porta
      for (let i = 0; i < 2; i++) {
        const pivotX = storeWidth - (i + 1) * vitrineW
        if (pivotX >= ex + ew + gap) {
          if (!collidesWithObstacle(pivotX, wallY, vitrineW, vitrineH, 0)) {
            generatedItems.push(makeItem(
              `catalog-15${lineSuffix}`, 'Vitrine PF', '✨',
              pivotX, wallY, vitrineW, vitrineH,
              '#F0F9FF', '#0369A1',
              { rotation: 0, isWallItem: true }
            ))
          }
        }
      }

      // Lado Esquerdo (Menor X) - Começa no canto esquerdo e vai em direção à porta (apenas se houver espaço livre)
      for (let i = 0; i < 2; i++) {
        const pivotX = i * vitrineW
        const endX = pivotX + vitrineW
        if (endX <= ex - gap) {
          if (!collidesWithObstacle(pivotX, wallY, vitrineW, vitrineH, 0)) {
            generatedItems.push(makeItem(
              `catalog-15${lineSuffix}`, 'Vitrine PF', '✨',
              pivotX, wallY, vitrineW, vitrineH,
              '#F0F9FF', '#0369A1',
              { rotation: 0, isWallItem: true }
            ))
          }
        }
      }
    } else if (entranceWall === 'Left') {
      const wallX = WALL_SHELF_DEPTH

      // Lado Direito (Maior Y) - Começa no canto inferior e vai em direção à porta
      for (let i = 0; i < 2; i++) {
        const pivotY = storeHeight - (i + 1) * vitrineW
        if (pivotY >= ey + eh + gap) {
          if (!collidesWithObstacle(wallX, pivotY, vitrineW, vitrineH, 90)) {
            generatedItems.push(makeItem(
              `catalog-15${lineSuffix}`, 'Vitrine PF', '✨',
              wallX, pivotY, vitrineW, vitrineH,
              '#F0F9FF', '#0369A1',
              { rotation: 90, isWallItem: true }
            ))
          }
        }
      }

      // Lado Esquerdo (Menor Y) - Começa no canto superior e vai em direção à porta (apenas se houver espaço livre)
      for (let i = 0; i < 2; i++) {
        const pivotY = i * vitrineW
        const endY = pivotY + vitrineW
        if (endY <= ey - gap) {
          if (!collidesWithObstacle(wallX, pivotY, vitrineW, vitrineH, 90)) {
            generatedItems.push(makeItem(
              `catalog-15${lineSuffix}`, 'Vitrine PF', '✨',
              wallX, pivotY, vitrineW, vitrineH,
              '#F0F9FF', '#0369A1',
              { rotation: 90, isWallItem: true }
            ))
          }
        }
      }
    } else if (entranceWall === 'Right') {
      const wallX = storeWidth - WALL_SHELF_DEPTH

      // Lado Direito (Maior Y) - Começa no canto inferior e vai em direção à porta
      for (let i = 0; i < 2; i++) {
        const pivotY = storeHeight - i * vitrineW
        const startY = pivotY - vitrineW
        if (startY >= ey + eh + gap) {
          if (!collidesWithObstacle(wallX, pivotY, vitrineW, vitrineH, 270)) {
            generatedItems.push(makeItem(
              `catalog-15${lineSuffix}`, 'Vitrine PF', '✨',
              wallX, pivotY, vitrineW, vitrineH,
              '#F0F9FF', '#0369A1',
              { rotation: 270, isWallItem: true }
            ))
          }
        }
      }

      // Lado Esquerdo (Menor Y) - Começa no canto superior e vai em direção à porta (apenas se houver espaço livre)
      for (let i = 0; i < 2; i++) {
        const pivotY = (i + 1) * vitrineW
        const startY = pivotY - vitrineW
        if (pivotY <= ey - gap) {
          if (!collidesWithObstacle(wallX, pivotY, vitrineW, vitrineH, 270)) {
            generatedItems.push(makeItem(
              `catalog-15${lineSuffix}`, 'Vitrine PF', '✨',
              wallX, pivotY, vitrineW, vitrineH,
              '#F0F9FF', '#0369A1',
              { rotation: 270, isWallItem: true }
            ))
          }
        }
      }
    }
  }

  // 3. Gerar Zonas Conforme Case
  if (rxWall === 'Top') {
    // Back wall medicines along y = 0
    const backWallY = 0
    const backWallStart = 0.0
    const backWallEnd = storeWidth
    let currentX = backWallStart

    while (currentX + 0.5 <= backWallEnd) {
      const remaining = backWallEnd - currentX
      let itemId = `catalog-22${lineSuffix}`
      let w = 0.5
      if (remaining >= 1.0) {
        itemId = `catalog-23${lineSuffix}`
        w = 1.0
      } else if (remaining >= 0.807) {
        itemId = `catalog-21${lineSuffix}`
        w = 0.807
      }
      
      if (!collidesWithObstacle(currentX, backWallY, w, medShelfDepth, 0)) {
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
          { rotation: 0, isWallItem: true }
        ))
      }
      currentX += w
    }

    // Counters facing UP (rotation 180) at y = medShelfDepth + operatorSpace + balcaoDepth
    const balcaoY = medShelfDepth + operatorSpace + balcaoDepth

    // Left and Right limits for the counter line (aligned with side wall shelves)
    const leftLimit = 0
    const rightLimit = storeWidth
    const availableWidth = rightLimit - leftLimit

    const isLarge = storeWidth * storeHeight > 100 // Area > 100m2

    let checkoutIslandMin: number | undefined
    let checkoutIslandMax: number | undefined

    if (isLarge) {
      const entX = entrance?.x ?? (storeWidth / 2)
      const entW = entrance?.width ?? STANDARD_PASSAGE_WIDTH
      const checkoutY = storeHeight - STANDARD_PASSAGE_WIDTH
      let checkoutX = entX - 0.20
      let placeOnLeft = true
      if (entX < 2.0) {
        checkoutX = Math.min(storeWidth, entX + entW + 1.4)
        placeOnLeft = false
      }
      checkoutIslandMin = checkoutX - STANDARD_PASSAGE_WIDTH
      checkoutIslandMax = checkoutX

      // 1. Place L-Checkout (Rotation 90)
      if (!collidesWithObstacle(checkoutX, checkoutY, STANDARD_PASSAGE_WIDTH, STANDARD_PASSAGE_WIDTH, 90)) {
        generatedItems.push(makeItem(
          `catalog-131${lineSuffix}`,
          'Checkout em L',
          '💳',
          checkoutX,
          checkoutY,
          STANDARD_PASSAGE_WIDTH,
          STANDARD_PASSAGE_WIDTH,
          '#DBEAFE',
          '#1D4ED8',
          { rotation: 90, width: STANDARD_PASSAGE_WIDTH, height: STANDARD_PASSAGE_WIDTH }
        ))
      }

      // 2. Painel canaletado atrás do checkout + vitrine ao lado (sem cestões de canto)
      placeCheckoutSurroundings(checkoutX, checkoutY, 90, placeOnLeft, 'Top')
    }

    // Ilha de cestões na entrada: primeiro item que o cliente vê ao entrar (1.2m da parede)
    {
      const entX = entrance?.x ?? (storeWidth / 2)
      placeEntranceIsland('y', storeHeight, 'x', entX, -1, checkoutIslandMin, checkoutIslandMax)
    }

    // 2. Place Counter Line (completely closed, leaving exactly 1.20m passage, no gaps at the ends)
    let passageW = STANDARD_PASSAGE_WIDTH
    if (availableWidth < 3.20) {
      passageW = Math.max(CORNER_GAP_LIMIT, availableWidth - 2.00)
    }
    const totalCounterW = availableWidth - passageW
    const twoGroups = totalCounterW >= 2.00

    if (twoGroups) {
      const W_left = Math.round((totalCounterW / 2) * 100) / 100
      const W_right = Math.round((totalCounterW - W_left) * 100) / 100

      // Left Group (starts at leftLimit)
      // Lateral Caixa: spans leftLimit to leftLimit + WALL_SHELF_DEPTH
      const latCxX = leftLimit + WALL_SHELF_DEPTH
      if (!collidesWithObstacle(latCxX, balcaoY - BALCAO_DEPTH, BALCAO_DEPTH, WALL_SHELF_DEPTH, 90)) {
        generatedItems.push(makeItem(
          `catalog-81${lineSuffix}`,
          'Lateral Caixa',
          '📥',
          latCxX,
          balcaoY - BALCAO_DEPTH,
          BALCAO_DEPTH,
          WALL_SHELF_DEPTH,
          '#EFF6FF',
          '#2563EB',
          { rotation: 90 }
        ))
      }
      // Caixa: spans leftLimit + WALL_SHELF_DEPTH to leftLimit + 0.86
      const cxX = leftLimit + 0.86
      if (!collidesWithObstacle(cxX, balcaoY, 0.60, BALCAO_DEPTH, 180)) {
        generatedItems.push(makeItem(
          `catalog-61${lineSuffix}`,
          'Caixa',
          '💳',
          cxX,
          balcaoY,
          0.60,
          BALCAO_DEPTH,
          '#D1FAE5',
          '#047857',
          { rotation: 180 }
        ))
      }
      // Balcões: span leftLimit + 0.86 to leftLimit + W_left
      const W_balcao = W_left - 0.86
      if (W_balcao > 0.01) {
        const N = Math.max(1, Math.round(W_balcao / 1.00))
        const w_each = W_balcao / N
        for (let i = 0; i < N; i++) {
          const bx_min = leftLimit + 0.86 + i * w_each
          const bx_max = bx_min + w_each
          const balcaoId = getBalcaoIdForWidth(w_each, lineSuffix)
          if (!collidesWithObstacle(bx_max, balcaoY, w_each, BALCAO_DEPTH, 180)) {
            generatedItems.push(makeItem(
              balcaoId,
              'Balcão de Atendimento',
              '🏪',
              bx_max,
              balcaoY,
              w_each,
              BALCAO_DEPTH,
              '#DBEAFE',
              '#1D4ED8',
              { rotation: 180, width: w_each }
            ))
          }
        }
      }

      // Right Group (ends at rightLimit)
      // Lateral Caixa: spans rightLimit - WALL_SHELF_DEPTH to rightLimit
      const latCxRX = rightLimit - WALL_SHELF_DEPTH
      if (!collidesWithObstacle(latCxRX, balcaoY, BALCAO_DEPTH, WALL_SHELF_DEPTH, 270)) {
        generatedItems.push(makeItem(
          `catalog-81${lineSuffix}`,
          'Lateral Caixa',
          '📥',
          latCxRX,
          balcaoY,
          BALCAO_DEPTH,
          WALL_SHELF_DEPTH,
          '#EFF6FF',
          '#2563EB',
          { rotation: 270 }
        ))
      }
      // Caixa: spans rightLimit - 0.86 to rightLimit - WALL_SHELF_DEPTH
      const rightCxX = rightLimit - WALL_SHELF_DEPTH
      if (!collidesWithObstacle(rightCxX, balcaoY, 0.60, BALCAO_DEPTH, 180)) {
        generatedItems.push(makeItem(
          `catalog-61${lineSuffix}`,
          'Caixa',
          '💳',
          rightCxX,
          balcaoY,
          0.60,
          BALCAO_DEPTH,
          '#D1FAE5',
          '#047857',
          { rotation: 180 }
        ))
      }
      // Balcões: span rightLimit - W_right to rightLimit - 0.86
      const W_balcaoR = W_right - 0.86
      if (W_balcaoR > 0.01) {
        const N = Math.max(1, Math.round(W_balcaoR / 1.00))
        const w_each = W_balcaoR / N
        for (let i = 0; i < N; i++) {
          const bx_min = rightLimit - 0.86 - (i + 1) * w_each
          const bx_max = bx_min + w_each
          const balcaoId = getBalcaoIdForWidth(w_each, lineSuffix)
          if (!collidesWithObstacle(bx_max, balcaoY, w_each, BALCAO_DEPTH, 180)) {
            generatedItems.push(makeItem(
              balcaoId,
              'Balcão de Atendimento',
              '🏪',
              bx_max,
              balcaoY,
              w_each,
              BALCAO_DEPTH,
              '#DBEAFE',
              '#1D4ED8',
              { rotation: 180, width: w_each }
            ))
          }
        }
      }
    } else {
      // Single group
      const W_left = totalCounterW
      const latCxX = leftLimit + WALL_SHELF_DEPTH
      if (!collidesWithObstacle(latCxX, balcaoY - BALCAO_DEPTH, BALCAO_DEPTH, WALL_SHELF_DEPTH, 90)) {
        generatedItems.push(makeItem(
          `catalog-81${lineSuffix}`,
          'Lateral Caixa',
          '📥',
          latCxX,
          balcaoY - BALCAO_DEPTH,
          BALCAO_DEPTH,
          WALL_SHELF_DEPTH,
          '#EFF6FF',
          '#2563EB',
          { rotation: 90 }
        ))
      }
      const cxX = leftLimit + 0.86
      if (!collidesWithObstacle(cxX, balcaoY, 0.60, BALCAO_DEPTH, 180)) {
        generatedItems.push(makeItem(
          `catalog-61${lineSuffix}`,
          'Caixa',
          '💳',
          cxX,
          balcaoY,
          0.60,
          BALCAO_DEPTH,
          '#D1FAE5',
          '#047857',
          { rotation: 180 }
        ))
      }
      const W_balcao = W_left - 0.86
      if (W_balcao > 0.01) {
        const N = Math.max(1, Math.round(W_balcao / 1.00))
        const w_each = W_balcao / N
        for (let i = 0; i < N; i++) {
          const bx_min = leftLimit + 0.86 + i * w_each
          const bx_max = bx_min + w_each
          const balcaoId = getBalcaoIdForWidth(w_each, lineSuffix)
          if (!collidesWithObstacle(bx_max, balcaoY, w_each, BALCAO_DEPTH, 180)) {
            generatedItems.push(makeItem(
              balcaoId,
              'Balcão de Atendimento',
              '🏪',
              bx_max,
              balcaoY,
              w_each,
              BALCAO_DEPTH,
              '#DBEAFE',
              '#1D4ED8',
              { rotation: 180, width: w_each }
            ))
          }
        }
      }
    }

    // Wrap around side walls: Top section of Left and Right walls
    placeWrapAroundShelves(MEDICINE_SHELF_DEPTH, 'y', 90, medShelfDepth, balcaoY, 1)
    placeWrapAroundShelves(storeWidth - MEDICINE_SHELF_DEPTH, 'y', 270, medShelfDepth, balcaoY, 1)

    // 3. Paredes laterais: esquerda (MIP + fralda no final) / direita (beleza)
    placeSmartWallSequence(WALL_SHELF_DEPTH, 'y', 90, balcaoY, storeHeight - CORNER_GAP_LIMIT, 1, LEFT_PREFIX, LEFT_SUFFIX)
    placeSmartWallSequence(storeWidth - WALL_SHELF_DEPTH, 'y', 270, balcaoY, storeHeight - CORNER_GAP_LIMIT, 1, RIGHT_PREFIX)

    // 4. Place Central Gondolas — respeitando 1m de corredor até a ilha de cestões
    {
      const numIslandRows = (storeWidth * storeHeight) >= 60 ? 2 : 1
      // Borda interna da ilha (âncora da fileira mais profunda na loja)
      const islandInnerY = storeHeight - ENTRANCE_ISLAND_OFFSET - numIslandRows * CESTAO_SIZE
      const gondolaYEnd = islandInnerY - minCorridor
      placeHorizontalLayoutGondolas(balcaoY + minCorridor, gondolaYEnd)
    }

    centralMinY = balcaoY + minCorridor
    centralMaxY = storeHeight - minCorridor
  }
  else if (rxWall === 'Bottom') {
    // Back wall medicines along y = storeHeight
    const backWallY = storeHeight - medShelfDepth
    const backWallStart = 0.0
    const backWallEnd = storeWidth
    let currentX = backWallStart

    while (currentX + 0.5 <= backWallEnd) {
      const remaining = backWallEnd - currentX
      let itemId = `catalog-22${lineSuffix}`
      let w = 0.5
      if (remaining >= 1.0) {
        itemId = `catalog-23${lineSuffix}`
        w = 1.0
      } else if (remaining >= 0.807) {
        itemId = `catalog-21${lineSuffix}`
        w = 0.807
      }
      
      if (!collidesWithObstacle(currentX + w, storeHeight, w, medShelfDepth, 180)) {
        generatedItems.push(makeItem(
          itemId,
          'Prateleira Medicamentos',
          '💊',
          currentX + w,
          storeHeight,
          w,
          medShelfDepth,
          '#FDF8F0',
          '#8B7355',
          { rotation: 180, isWallItem: true }
        ))
      }
      currentX += w
    }

    const balcaoY = storeHeight - medShelfDepth - operatorSpace - balcaoDepth

    // Left and Right limits
    const leftLimit = 0
    const rightLimit = storeWidth
    const availableWidth = rightLimit - leftLimit

    const isLarge = storeWidth * storeHeight > 100 // Area > 100m2

    let checkoutIslandMin: number | undefined
    let checkoutIslandMax: number | undefined

    if (isLarge) {
      const entX = entrance?.x ?? (storeWidth / 2)
      const entW = entrance?.width ?? STANDARD_PASSAGE_WIDTH
      const checkoutY = STANDARD_PASSAGE_WIDTH
      let checkoutX = entX - 0.20
      let placeOnLeft = true
      if (entX < 2.0) {
        checkoutX = Math.min(storeWidth, entX + entW + 1.4)
        placeOnLeft = false
      }
      checkoutIslandMin = checkoutX - STANDARD_PASSAGE_WIDTH
      checkoutIslandMax = checkoutX

      // 1. Place L-Checkout (Rotation 180)
      if (!collidesWithObstacle(checkoutX, checkoutY, STANDARD_PASSAGE_WIDTH, STANDARD_PASSAGE_WIDTH, 180)) {
        generatedItems.push(makeItem(
          `catalog-131${lineSuffix}`,
          'Checkout em L',
          '💳',
          checkoutX,
          checkoutY,
          STANDARD_PASSAGE_WIDTH,
          STANDARD_PASSAGE_WIDTH,
          '#DBEAFE',
          '#1D4ED8',
          { rotation: 180, width: STANDARD_PASSAGE_WIDTH, height: STANDARD_PASSAGE_WIDTH }
        ))
      }

      // 2. Painel canaletado atrás do checkout + vitrine ao lado (sem cestões de canto)
      placeCheckoutSurroundings(checkoutX, checkoutY, 180, placeOnLeft, 'Bottom')
    }

    // Ilha de cestões na entrada: primeiro item que o cliente vê ao entrar (1.2m da parede)
    {
      const entX = entrance?.x ?? (storeWidth / 2)
      placeEntranceIsland('y', 0, 'x', entX, 1, checkoutIslandMin, checkoutIslandMax)
    }

    // 2. Place Counter Line (completely closed, leaving exactly 1.20m passage, no gaps at the ends)
    let passageW = STANDARD_PASSAGE_WIDTH
    if (availableWidth < 3.20) {
      passageW = Math.max(CORNER_GAP_LIMIT, availableWidth - 2.00)
    }
    const totalCounterW = availableWidth - passageW
    const twoGroups = totalCounterW >= 2.00

    if (twoGroups) {
      const W_left = Math.round((totalCounterW / 2) * 100) / 100
      const W_right = Math.round((totalCounterW - W_left) * 100) / 100

      // Left Group (starts at leftLimit)
      // Lateral Caixa: spans leftLimit to leftLimit + 0.26. Rotation 90.
      if (!collidesWithObstacle(WALL_SHELF_DEPTH, balcaoY, BALCAO_DEPTH, WALL_SHELF_DEPTH, 90)) {
        generatedItems.push(makeItem(
          `catalog-81${lineSuffix}`,
          'Lateral Caixa',
          '📥',
          WALL_SHELF_DEPTH,
          balcaoY,
          BALCAO_DEPTH,
          WALL_SHELF_DEPTH,
          '#EFF6FF',
          '#2563EB',
          { rotation: 90 }
        ))
      }
      // Caixa: spans leftLimit + WALL_SHELF_DEPTH to leftLimit + 0.86
      if (!collidesWithObstacle(leftLimit + WALL_SHELF_DEPTH, balcaoY, 0.60, BALCAO_DEPTH, 0)) {
        generatedItems.push(makeItem(
          `catalog-61${lineSuffix}`,
          'Caixa',
          '💳',
          leftLimit + WALL_SHELF_DEPTH,
          balcaoY,
          0.60,
          BALCAO_DEPTH,
          '#D1FAE5',
          '#047857',
          { rotation: 0 }
        ))
      }
      // Balcões: span leftLimit + 0.86 to leftLimit + W_left
      const W_balcao = W_left - 0.86
      if (W_balcao > 0.01) {
        const N = Math.max(1, Math.round(W_balcao / 1.00))
        const w_each = W_balcao / N
        for (let i = 0; i < N; i++) {
          const bx_min = leftLimit + 0.86 + i * w_each
          const balcaoId = getBalcaoIdForWidth(w_each, lineSuffix)
          if (!collidesWithObstacle(bx_min, balcaoY, w_each, BALCAO_DEPTH, 0)) {
            generatedItems.push(makeItem(
              balcaoId,
              'Balcão de Atendimento',
              '🏪',
              bx_min,
              balcaoY,
              w_each,
              BALCAO_DEPTH,
              '#DBEAFE',
              '#1D4ED8',
              { rotation: 0, width: w_each }
            ))
          }
        }
      }

      // Right Group (ends at rightLimit)
      // Lateral Caixa: spans rightLimit - WALL_SHELF_DEPTH to rightLimit. Rotation 270.
      const latCxX = rightLimit - WALL_SHELF_DEPTH
      if (!collidesWithObstacle(latCxX, balcaoY + BALCAO_DEPTH, BALCAO_DEPTH, WALL_SHELF_DEPTH, 270)) {
        generatedItems.push(makeItem(
          `catalog-81${lineSuffix}`,
          'Lateral Caixa',
          '📥',
          latCxX,
          balcaoY + BALCAO_DEPTH,
          BALCAO_DEPTH,
          WALL_SHELF_DEPTH,
          '#EFF6FF',
          '#2563EB',
          { rotation: 270 }
        ))
      }
      // Caixa: spans rightLimit - 0.86 to rightLimit - WALL_SHELF_DEPTH
      const cxX = rightLimit - 0.86
      if (!collidesWithObstacle(cxX, balcaoY, 0.60, BALCAO_DEPTH, 0)) {
        generatedItems.push(makeItem(
          `catalog-61${lineSuffix}`,
          'Caixa',
          '💳',
          cxX,
          balcaoY,
          0.60,
          BALCAO_DEPTH,
          '#D1FAE5',
          '#047857',
          { rotation: 0 }
        ))
      }
      // Balcões: span rightLimit - W_right to rightLimit - 0.86
      const W_balcaoR = W_right - 0.86
      if (W_balcaoR > 0.01) {
        const N = Math.max(1, Math.round(W_balcaoR / 1.00))
        const w_each = W_balcaoR / N
        for (let i = 0; i < N; i++) {
          const bx_min = rightLimit - 0.86 - (i + 1) * w_each
          const balcaoId = getBalcaoIdForWidth(w_each, lineSuffix)
          if (!collidesWithObstacle(bx_min, balcaoY, w_each, BALCAO_DEPTH, 0)) {
            generatedItems.push(makeItem(
              balcaoId,
              'Balcão de Atendimento',
              '🏪',
              bx_min,
              balcaoY,
              w_each,
              BALCAO_DEPTH,
              '#DBEAFE',
              '#1D4ED8',
              { rotation: 0, width: w_each }
            ))
          }
        }
      }
    } else {
      // Single group
      const W_left = totalCounterW
      if (!collidesWithObstacle(WALL_SHELF_DEPTH, balcaoY, BALCAO_DEPTH, WALL_SHELF_DEPTH, 90)) {
        generatedItems.push(makeItem(
          `catalog-81${lineSuffix}`,
          'Lateral Caixa',
          '📥',
          WALL_SHELF_DEPTH,
          balcaoY,
          BALCAO_DEPTH,
          WALL_SHELF_DEPTH,
          '#EFF6FF',
          '#2563EB',
          { rotation: 90 }
        ))
      }
      if (!collidesWithObstacle(leftLimit + WALL_SHELF_DEPTH, balcaoY, 0.60, BALCAO_DEPTH, 0)) {
        generatedItems.push(makeItem(
          `catalog-61${lineSuffix}`,
          'Caixa',
          '💳',
          leftLimit + WALL_SHELF_DEPTH,
          balcaoY,
          0.60,
          BALCAO_DEPTH,
          '#D1FAE5',
          '#047857',
          { rotation: 0 }
        ))
      }
      const W_balcao = W_left - 0.86
      if (W_balcao > 0.01) {
        const N = Math.max(1, Math.round(W_balcao / 1.00))
        const w_each = W_balcao / N
        for (let i = 0; i < N; i++) {
          const bx_min = leftLimit + 0.86 + i * w_each
          const balcaoId = getBalcaoIdForWidth(w_each, lineSuffix)
          if (!collidesWithObstacle(bx_min, balcaoY, w_each, BALCAO_DEPTH, 0)) {
            generatedItems.push(makeItem(
              balcaoId,
              'Balcão de Atendimento',
              '🏪',
              bx_min,
              balcaoY,
              w_each,
              BALCAO_DEPTH,
              '#DBEAFE',
              '#1D4ED8',
              { rotation: 0, width: w_each }
            ))
          }
        }
      }
    }

    placeWrapAroundShelves(MEDICINE_SHELF_DEPTH, 'y', 90, storeHeight - medShelfDepth, balcaoY, -1)
    placeWrapAroundShelves(storeWidth - MEDICINE_SHELF_DEPTH, 'y', 270, storeHeight - medShelfDepth, balcaoY, -1)

    // 3. Paredes laterais: esquerda (MIP + fralda no final) / direita (beleza)
    placeSmartWallSequence(WALL_SHELF_DEPTH, 'y', 90, balcaoY, CORNER_GAP_LIMIT, -1, LEFT_PREFIX, LEFT_SUFFIX)
    placeSmartWallSequence(storeWidth - WALL_SHELF_DEPTH, 'y', 270, balcaoY, CORNER_GAP_LIMIT, -1, RIGHT_PREFIX)

    // 4. Place Central Gondolas — respeitando 1m de corredor até a ilha de cestões
    {
      const numIslandRows = (storeWidth * storeHeight) >= 60 ? 2 : 1
      // Borda interna da ilha (borda inferior da fileira mais profunda na loja)
      const islandHighY = ENTRANCE_ISLAND_OFFSET + numIslandRows * CESTAO_SIZE
      const gondolaYStart = islandHighY + minCorridor
      placeHorizontalLayoutGondolas(gondolaYStart, balcaoY - minCorridor)
    }

    centralMinY = minCorridor
    centralMaxY = balcaoY - minCorridor
  }
  else if (rxWall === 'Left') {
    // Back wall medicines along x = 0
    const backWallX = 0
    const backWallStart = 0.0
    const backWallEnd = storeHeight
    let currentY = backWallStart

    while (currentY + 0.5 <= backWallEnd) {
      const remaining = backWallEnd - currentY
      let itemId = `catalog-22${lineSuffix}`
      let w = 0.5
      if (remaining >= 1.0) {
        itemId = `catalog-23${lineSuffix}`
        w = 1.0
      } else if (remaining >= 0.807) {
        itemId = `catalog-21${lineSuffix}`
        w = 0.807
      }
      
      if (!collidesWithObstacle(MEDICINE_SHELF_DEPTH, currentY, w, medShelfDepth, 90)) {
        generatedItems.push(makeItem(
          itemId,
          'Prateleira Medicamentos',
          '💊',
          MEDICINE_SHELF_DEPTH,
          currentY,
          w,
          medShelfDepth,
          '#FDF8F0',
          '#8B7355',
          { rotation: 90, isWallItem: true }
        ))
      }
      currentY += w
    }

    const balcaoX = medShelfDepth + operatorSpace + balcaoDepth

    // Top and Bottom limits
    const topLimit = 0
    const bottomLimit = storeHeight
    const availableHeight = bottomLimit - topLimit

    const isLarge = storeWidth * storeHeight > 100 // Area > 100m2

    let checkoutIslandMin: number | undefined
    let checkoutIslandMax: number | undefined

    if (isLarge) {
      const entY = entrance?.y ?? (storeHeight / 2)
      const entW = entrance?.width ?? STANDARD_PASSAGE_WIDTH
      const checkoutX = storeWidth - STANDARD_PASSAGE_WIDTH
      let checkoutY = entY - 0.20
      let placeOnLeft = true
      if (entY < 2.0) {
        checkoutY = Math.min(storeHeight, entY + entW + 1.4)
        placeOnLeft = false
      }
      checkoutIslandMin = checkoutY - STANDARD_PASSAGE_WIDTH
      checkoutIslandMax = checkoutY

      // 1. Place L-Checkout (Rotation 270)
      if (!collidesWithObstacle(checkoutX, checkoutY, STANDARD_PASSAGE_WIDTH, STANDARD_PASSAGE_WIDTH, 270)) {
        generatedItems.push(makeItem(
          `catalog-131${lineSuffix}`,
          'Checkout em L',
          '💳',
          checkoutX,
          checkoutY,
          STANDARD_PASSAGE_WIDTH,
          STANDARD_PASSAGE_WIDTH,
          '#DBEAFE',
          '#1D4ED8',
          { rotation: 270, width: STANDARD_PASSAGE_WIDTH, height: STANDARD_PASSAGE_WIDTH }
        ))
      }

      // 2. Painel canaletado atrás do checkout + vitrine ao lado (sem cestões de canto)
      placeCheckoutSurroundings(checkoutX, checkoutY, 270, placeOnLeft, 'Left')
    }

    // Ilha de cestões na entrada (1.2m da parede direita, onde fica a entrada)
    {
      const entY = entrance?.y ?? (storeHeight / 2)
      placeEntranceIsland('x', storeWidth, 'y', entY, -1, checkoutIslandMin, checkoutIslandMax)
    }

    // 2. Place Counter Line (completely closed, leaving exactly 1.20m passage, no gaps at the ends)
    let passageW = STANDARD_PASSAGE_WIDTH
    if (availableHeight < 3.20) {
      passageW = Math.max(CORNER_GAP_LIMIT, availableHeight - 2.00)
    }
    const totalCounterW = availableHeight - passageW
    const twoGroups = totalCounterW >= 2.00

    if (twoGroups) {
      const W_top = Math.round((totalCounterW / 2) * 100) / 100
      const W_bottom = Math.round((totalCounterW - W_top) * 100) / 100

      // Top Group (starts at topLimit)
      // Lateral Caixa: spans topLimit to topLimit + 0.26. Rotation 0.
      if (!collidesWithObstacle(balcaoX - BALCAO_DEPTH, topLimit, BALCAO_DEPTH, WALL_SHELF_DEPTH, 0)) {
        generatedItems.push(makeItem(
          `catalog-81${lineSuffix}`,
          'Lateral Caixa',
          '📥',
          balcaoX - BALCAO_DEPTH,
          topLimit,
          BALCAO_DEPTH,
          WALL_SHELF_DEPTH,
          '#EFF6FF',
          '#2563EB',
          { rotation: 0 }
        ))
      }
      // Caixa: spans topLimit + WALL_SHELF_DEPTH to topLimit + 0.86
      if (!collidesWithObstacle(balcaoX, topLimit + WALL_SHELF_DEPTH, 0.60, BALCAO_DEPTH, 90)) {
        generatedItems.push(makeItem(
          `catalog-61${lineSuffix}`,
          'Caixa',
          '💳',
          balcaoX,
          topLimit + WALL_SHELF_DEPTH,
          0.60,
          BALCAO_DEPTH,
          '#D1FAE5',
          '#047857',
          { rotation: 90 }
        ))
      }
      // Balcões: span topLimit + 0.86 to topLimit + W_top
      const W_balcao = W_top - 0.86
      if (W_balcao > 0.01) {
        const N = Math.max(1, Math.round(W_balcao / 1.00))
        const w_each = W_balcao / N
        for (let i = 0; i < N; i++) {
          const by_min = topLimit + 0.86 + i * w_each
          const balcaoId = getBalcaoIdForWidth(w_each, lineSuffix)
          if (!collidesWithObstacle(balcaoX, by_min, w_each, BALCAO_DEPTH, 90)) {
            generatedItems.push(makeItem(
              balcaoId,
              'Balcão de Atendimento',
              '🏪',
              balcaoX,
              by_min,
              w_each,
              BALCAO_DEPTH,
              '#DBEAFE',
              '#1D4ED8',
              { rotation: 90, width: w_each }
            ))
          }
        }
      }

      // Bottom Group (ends at bottomLimit)
      // Lateral Caixa: spans bottomLimit - WALL_SHELF_DEPTH to bottomLimit. Rotation 180.
      if (!collidesWithObstacle(balcaoX, bottomLimit, BALCAO_DEPTH, WALL_SHELF_DEPTH, 180)) {
        generatedItems.push(makeItem(
          `catalog-81${lineSuffix}`,
          'Lateral Caixa',
          '📥',
          balcaoX,
          bottomLimit,
          BALCAO_DEPTH,
          WALL_SHELF_DEPTH,
          '#EFF6FF',
          '#2563EB',
          { rotation: 180 }
        ))
      }
      // Caixa: spans bottomLimit - 0.86 to bottomLimit - WALL_SHELF_DEPTH
      const cxY = bottomLimit - 0.86
      if (!collidesWithObstacle(balcaoX, cxY, 0.60, BALCAO_DEPTH, 90)) {
        generatedItems.push(makeItem(
          `catalog-61${lineSuffix}`,
          'Caixa',
          '💳',
          balcaoX,
          cxY,
          0.60,
          BALCAO_DEPTH,
          '#D1FAE5',
          '#047857',
          { rotation: 90 }
        ))
      }
      // Balcões: span bottomLimit - W_bottom to bottomLimit - 0.86
      const W_balcaoB = W_bottom - 0.86
      if (W_balcaoB > 0.01) {
        const N = Math.max(1, Math.round(W_balcaoB / 1.00))
        const w_each = W_balcaoB / N
        for (let i = 0; i < N; i++) {
          const by_min = bottomLimit - 0.86 - (i + 1) * w_each
          const balcaoId = getBalcaoIdForWidth(w_each, lineSuffix)
          if (!collidesWithObstacle(balcaoX, by_min, w_each, BALCAO_DEPTH, 90)) {
            generatedItems.push(makeItem(
              balcaoId,
              'Balcão de Atendimento',
              '🏪',
              balcaoX,
              by_min,
              w_each,
              BALCAO_DEPTH,
              '#DBEAFE',
              '#1D4ED8',
              { rotation: 90, width: w_each }
            ))
          }
        }
      }
    } else {
      // Single group
      const W_top = totalCounterW
      if (!collidesWithObstacle(balcaoX - BALCAO_DEPTH, topLimit, BALCAO_DEPTH, WALL_SHELF_DEPTH, 0)) {
        generatedItems.push(makeItem(
          `catalog-81${lineSuffix}`,
          'Lateral Caixa',
          '📥',
          balcaoX - BALCAO_DEPTH,
          topLimit,
          BALCAO_DEPTH,
          WALL_SHELF_DEPTH,
          '#EFF6FF',
          '#2563EB',
          { rotation: 0 }
        ))
      }
      if (!collidesWithObstacle(balcaoX, topLimit + WALL_SHELF_DEPTH, 0.60, BALCAO_DEPTH, 90)) {
        generatedItems.push(makeItem(
          `catalog-61${lineSuffix}`,
          'Caixa',
          '💳',
          balcaoX,
          topLimit + WALL_SHELF_DEPTH,
          0.60,
          BALCAO_DEPTH,
          '#D1FAE5',
          '#047857',
          { rotation: 90 }
        ))
      }
      const W_balcao = W_top - 0.86
      if (W_balcao > 0.01) {
        const N = Math.max(1, Math.round(W_balcao / 1.00))
        const w_each = W_balcao / N
        for (let i = 0; i < N; i++) {
          const by_min = topLimit + 0.86 + i * w_each
          const balcaoId = getBalcaoIdForWidth(w_each, lineSuffix)
          if (!collidesWithObstacle(balcaoX, by_min, w_each, BALCAO_DEPTH, 90)) {
            generatedItems.push(makeItem(
              balcaoId,
              'Balcão de Atendimento',
              '🏪',
              balcaoX,
              by_min,
              w_each,
              BALCAO_DEPTH,
              '#DBEAFE',
              '#1D4ED8',
              { rotation: 90, width: w_each }
            ))
          }
        }
      }
    }

    placeWrapAroundShelves(0, 'x', 0, medShelfDepth, balcaoX, 1)
    placeWrapAroundShelves(storeHeight, 'x', 180, medShelfDepth, balcaoX, 1)

    // 3. Place side wall sequences (perfumaria/MIPs)
    placeSmartWallSequence(0, 'x', 0, balcaoX, storeWidth - CORNER_GAP_LIMIT, 1, RIGHT_PREFIX)
    placeSmartWallSequence(storeHeight, 'x', 180, balcaoX, storeWidth - CORNER_GAP_LIMIT, 1, LEFT_PREFIX, LEFT_SUFFIX)

    // 4. Place Central Gondolas — respeitando 1m de corredor até a ilha de cestões
    {
      const numIslandRows = (storeWidth * storeHeight) >= 60 ? 2 : 1
      // Borda interna da ilha (âncora da fileira mais profunda na loja, lado esquerdo)
      const islandInnerX = storeWidth - ENTRANCE_ISLAND_OFFSET - numIslandRows * CESTAO_SIZE
      const gondolaXEnd = islandInnerX - minCorridor
      placeVerticalLayoutGondolas(balcaoX + minCorridor, gondolaXEnd)
    }

    centralMinX = balcaoX + minCorridor
    centralMaxX = storeWidth - minCorridor
  } 
  else if (rxWall === 'Right') {
    // Back wall medicines along x = storeWidth
    const backWallX = storeWidth - medShelfDepth
    const backWallStart = 0.0
    const backWallEnd = storeHeight
    let currentY = backWallStart

    while (currentY + 0.5 <= backWallEnd) {
      const remaining = backWallEnd - currentY
      let itemId = `catalog-22${lineSuffix}`
      let w = 0.5
      if (remaining >= 1.0) {
        itemId = `catalog-23${lineSuffix}`
        w = 1.0
      } else if (remaining >= 0.807) {
        itemId = `catalog-21${lineSuffix}`
        w = 0.807
      }
      
      if (!collidesWithObstacle(backWallX, currentY + w, w, medShelfDepth, 270)) {
        generatedItems.push(makeItem(
          itemId,
          'Prateleira Medicamentos',
          '💊',
          backWallX,
          currentY + w,
          w,
          medShelfDepth,
          '#FDF8F0',
          '#8B7355',
          { rotation: 270, isWallItem: true }
        ))
      }
      currentY += w
    }

    const balcaoX = storeWidth - medShelfDepth - operatorSpace - balcaoDepth

    // Top and Bottom limits
    const topLimit = 0
    const bottomLimit = storeHeight
    const availableHeight = bottomLimit - topLimit

    const isLarge = storeWidth * storeHeight > 100 // Area > 100m2

    let checkoutIslandMin: number | undefined
    let checkoutIslandMax: number | undefined

    if (isLarge) {
      const entY = entrance?.y ?? (storeHeight / 2)
      const entW = entrance?.width ?? STANDARD_PASSAGE_WIDTH
      const checkoutX = STANDARD_PASSAGE_WIDTH
      let checkoutY = entY - 1.4
      let placeOnLeft = true
      if (entY < 2.0) {
        checkoutY = entY + entW + 0.20
        placeOnLeft = false
      }
      checkoutIslandMin = checkoutY
      checkoutIslandMax = checkoutY + STANDARD_PASSAGE_WIDTH

      // 1. Place L-Checkout (Rotation 90)
      if (!collidesWithObstacle(checkoutX, checkoutY, STANDARD_PASSAGE_WIDTH, STANDARD_PASSAGE_WIDTH, 90)) {
        generatedItems.push(makeItem(
          `catalog-131${lineSuffix}`,
          'Checkout em L',
          '💳',
          checkoutX,
          checkoutY,
          STANDARD_PASSAGE_WIDTH,
          STANDARD_PASSAGE_WIDTH,
          '#DBEAFE',
          '#1D4ED8',
          { rotation: 90, width: STANDARD_PASSAGE_WIDTH, height: STANDARD_PASSAGE_WIDTH }
        ))
      }

      // 2. Painel canaletado atrás do checkout + vitrine ao lado (sem cestões de canto)
      placeCheckoutSurroundings(checkoutX, checkoutY, 90, placeOnLeft, 'Right')
    }

    // Ilha de cestões na entrada (1.2m da parede esquerda, onde fica a entrada)
    {
      const entY = entrance?.y ?? (storeHeight / 2)
      placeEntranceIsland('x', 0, 'y', entY, 1, checkoutIslandMin, checkoutIslandMax)
    }

    // 2. Place Counter Line (completely closed, leaving exactly 1.20m passage, no gaps at the ends)
    let passageW = STANDARD_PASSAGE_WIDTH
    if (availableHeight < 3.20) {
      passageW = Math.max(CORNER_GAP_LIMIT, availableHeight - 2.00)
    }
    const totalCounterW = availableHeight - passageW
    const twoGroups = totalCounterW >= 2.00

    if (twoGroups) {
      const W_top = Math.round((totalCounterW / 2) * 100) / 100
      const W_bottom = Math.round((totalCounterW - W_top) * 100) / 100

      // Top Group (starts at topLimit)
      // Lateral Caixa: spans topLimit to topLimit + 0.26. Rotation 0.
      if (!collidesWithObstacle(balcaoX, topLimit, BALCAO_DEPTH, WALL_SHELF_DEPTH, 0)) {
        generatedItems.push(makeItem(
          `catalog-81${lineSuffix}`,
          'Lateral Caixa',
          '📥',
          balcaoX,
          topLimit,
          BALCAO_DEPTH,
          WALL_SHELF_DEPTH,
          '#EFF6FF',
          '#2563EB',
          { rotation: 0 }
        ))
      }
      // Caixa: spans topLimit + WALL_SHELF_DEPTH to topLimit + 0.86
      const cxY = topLimit + 0.86
      if (!collidesWithObstacle(balcaoX, cxY, 0.60, BALCAO_DEPTH, 270)) {
        generatedItems.push(makeItem(
          `catalog-61${lineSuffix}`,
          'Caixa',
          '💳',
          balcaoX,
          cxY,
          0.60,
          BALCAO_DEPTH,
          '#D1FAE5',
          '#047857',
          { rotation: 270 }
        ))
      }
      // Balcões: span topLimit + 0.86 to topLimit + W_top
      const W_balcao = W_top - 0.86
      if (W_balcao > 0.01) {
        const N = Math.max(1, Math.round(W_balcao / 1.00))
        const w_each = W_balcao / N
        for (let i = 0; i < N; i++) {
          const by_max = topLimit + 0.86 + (i + 1) * w_each
          const balcaoId = getBalcaoIdForWidth(w_each, lineSuffix)
          if (!collidesWithObstacle(balcaoX, by_max, w_each, BALCAO_DEPTH, 270)) {
            generatedItems.push(makeItem(
              balcaoId,
              'Balcão de Atendimento',
              '🏪',
              balcaoX,
              by_max,
              w_each,
              BALCAO_DEPTH,
              '#DBEAFE',
              '#1D4ED8',
              { rotation: 270, width: w_each }
            ))
          }
        }
      }

      // Bottom Group (ends at bottomLimit)
      // Lateral Caixa: spans bottomLimit - WALL_SHELF_DEPTH to bottomLimit. Rotation 180.
      if (!collidesWithObstacle(balcaoX + BALCAO_DEPTH, bottomLimit, BALCAO_DEPTH, WALL_SHELF_DEPTH, 180)) {
        generatedItems.push(makeItem(
          `catalog-81${lineSuffix}`,
          'Lateral Caixa',
          '📥',
          balcaoX + BALCAO_DEPTH,
          bottomLimit,
          BALCAO_DEPTH,
          WALL_SHELF_DEPTH,
          '#EFF6FF',
          '#2563EB',
          { rotation: 180 }
        ))
      }
      // Caixa: spans bottomLimit - 0.86 to bottomLimit - WALL_SHELF_DEPTH
      const bottomCxY = bottomLimit - WALL_SHELF_DEPTH
      if (!collidesWithObstacle(balcaoX, bottomCxY, 0.60, BALCAO_DEPTH, 270)) {
        generatedItems.push(makeItem(
          `catalog-61${lineSuffix}`,
          'Caixa',
          '💳',
          balcaoX,
          bottomCxY,
          0.60,
          BALCAO_DEPTH,
          '#D1FAE5',
          '#047857',
          { rotation: 270 }
        ))
      }
      // Balcões: span bottomLimit - W_bottom to bottomLimit - 0.86
      const W_balcaoB = W_bottom - 0.86
      if (W_balcaoB > 0.01) {
        const N = Math.max(1, Math.round(W_balcaoB / 1.00))
        const w_each = W_balcaoB / N
        for (let i = 0; i < N; i++) {
          const by_max = bottomLimit - 0.86 - i * w_each
          const balcaoId = getBalcaoIdForWidth(w_each, lineSuffix)
          if (!collidesWithObstacle(balcaoX, by_max, w_each, BALCAO_DEPTH, 270)) {
            generatedItems.push(makeItem(
              balcaoId,
              'Balcão de Atendimento',
              '🏪',
              balcaoX,
              by_max,
              w_each,
              BALCAO_DEPTH,
              '#DBEAFE',
              '#1D4ED8',
              { rotation: 270, width: w_each }
            ))
          }
        }
      }
    } else {
      // Single group
      const W_top = totalCounterW
      if (!collidesWithObstacle(balcaoX, topLimit, BALCAO_DEPTH, WALL_SHELF_DEPTH, 0)) {
        generatedItems.push(makeItem(
          `catalog-81${lineSuffix}`,
          'Lateral Caixa',
          '📥',
          balcaoX,
          topLimit,
          BALCAO_DEPTH,
          WALL_SHELF_DEPTH,
          '#EFF6FF',
          '#2563EB',
          { rotation: 0 }
        ))
      }
      const cxY = topLimit + 0.86
      if (!collidesWithObstacle(balcaoX, cxY, 0.60, BALCAO_DEPTH, 270)) {
        generatedItems.push(makeItem(
          `catalog-61${lineSuffix}`,
          'Caixa',
          '💳',
          balcaoX,
          cxY,
          0.60,
          BALCAO_DEPTH,
          '#D1FAE5',
          '#047857',
          { rotation: 270 }
        ))
      }
      const W_balcao = W_top - 0.86
      if (W_balcao > 0.01) {
        const N = Math.max(1, Math.round(W_balcao / 1.00))
        const w_each = W_balcao / N
        for (let i = 0; i < N; i++) {
          const by_max = topLimit + 0.86 + (i + 1) * w_each
          const balcaoId = getBalcaoIdForWidth(w_each, lineSuffix)
          if (!collidesWithObstacle(balcaoX, by_max, w_each, BALCAO_DEPTH, 270)) {
            generatedItems.push(makeItem(
              balcaoId,
              'Balcão de Atendimento',
              '🏪',
              balcaoX,
              by_max,
              w_each,
              BALCAO_DEPTH,
              '#DBEAFE',
              '#1D4ED8',
              { rotation: 270, width: w_each }
            ))
          }
        }
      }
    }

    placeWrapAroundShelves(0, 'x', 0, storeWidth - medShelfDepth, balcaoX, -1)
    placeWrapAroundShelves(storeHeight, 'x', 180, storeWidth - medShelfDepth, balcaoX, -1)

    // 3. Place side wall sequences (perfumaria/MIPs)
    placeSmartWallSequence(0, 'x', 0, balcaoX, CORNER_GAP_LIMIT, -1, LEFT_PREFIX, LEFT_SUFFIX)
    placeSmartWallSequence(storeHeight, 'x', 180, balcaoX, CORNER_GAP_LIMIT, -1, RIGHT_PREFIX)

    // 4. Place Central Gondolas — respeitando 1m de corredor até a ilha de cestões
    {
      const numIslandRows = (storeWidth * storeHeight) >= 60 ? 2 : 1
      // Borda interna da ilha (borda direita da fileira mais profunda na loja)
      const islandHighX = ENTRANCE_ISLAND_OFFSET + numIslandRows * CESTAO_SIZE
      const gondolaXStart = islandHighX + minCorridor
      placeVerticalLayoutGondolas(gondolaXStart, balcaoX - minCorridor)
    }

    centralMinX = minCorridor
    centralMaxX = balcaoX - minCorridor
  }

  // 3.5. LOJAS ACIMA DE 100m²: CHECKOUT EM L E CESTÕES EM L (Already processed in rxWall blocks)

  // 4. TRATAMENTO DE PILARES E CESTÕES
  const pillars = existingObstacles.filter(obs => obs.isPillar)
  
  pillars.forEach(pillar => {
    const px = pillar.x ?? 0
    const py = pillar.y ?? 0
    const pw = pillar.width ?? 0.3
    const ph = pillar.height ?? 0.3

    const candidates = [
      { x: px + (pw - CESTAO_SIZE) / 2, y: py - CESTAO_SIZE }, // Norte
      { x: px + (pw - CESTAO_SIZE) / 2, y: py + ph },  // Sul
      { x: px - CESTAO_SIZE, y: py + (ph - CESTAO_SIZE) / 2 }, // Oeste
      { x: px + pw, y: py + (ph - CESTAO_SIZE) / 2 },  // Leste
    ]

    candidates.forEach(cand => {
      const insideX = cand.x >= centralMinX && cand.x + CESTAO_SIZE <= centralMaxX
      const insideY = cand.y >= centralMinY && cand.y + CESTAO_SIZE <= centralMaxY
      
      if (insideX && insideY) {
        const collides = generatedItems.some(item => {
          const itemX = item.x ?? 0
          const itemY = item.y ?? 0
          const itemW = item.width ?? CESTAO_SIZE
          const itemH = item.height ?? CESTAO_SIZE
          const itemRot = item.rotation ?? 0

          const boxA = getRotatedBounds(itemX, itemY, itemW, itemH, itemRot)
          const boxB = { x: cand.x, y: cand.y, width: CESTAO_SIZE, height: CESTAO_SIZE }

          return checkAABBCollision(boxA, boxB)
        })

        if (!collides) {
          generatedItems.push(makeItem(
            `catalog-71${lineSuffix}`,
            'Cestão Promocional',
            '🧺',
            cand.x,
            cand.y,
            CESTAO_SIZE,
            CESTAO_SIZE,
            '#FDF8F0',
            '#8B7355',
            { rotation: 0 }
          ))
        }
      }
    })
  })

  // Chamada para posicionar os expositores de vitrine na parede de entrada por último
  // para evitar colidir e bloquear outros itens cruciais como o checkout em L.
  placeVitrinesOnEntranceWall()

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

// Helper para alinhar coordenadas em wrap-around e expositores
function getPos(currVal: number, w: number, rot: number, sign: number): number {
  if (rot === 90) {
    return sign === 1 ? currVal : currVal - w
  } else if (rot === 270) {
    return sign === 1 ? currVal + w : currVal
  } else if (rot === 180) {
    return sign === 1 ? currVal + w : currVal
  } else { // rot === 0
    return sign === 1 ? currVal : currVal - w
  }
}

function getBalcaoIdForWidth(w: number, suffix: string): string {
  if (w >= 0.90) return `catalog-51${suffix}`
  if (w >= 0.75) return `catalog-52${suffix}`
  if (w >= 0.65) return `catalog-53${suffix}`
  return `catalog-54${suffix}`
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
    category: template?.category ?? 'GONDOLAS',
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
    isDoor: template?.isDoor,
    isEmergency: template?.isEmergency,
    isPillar: template?.isPillar,
    isObstacle: template?.isObstacle,
    isRoom: template?.isRoom,
    isWallItem: template?.isWallItem,
    isRound: template?.isRound,
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

export { STORE_TYPE_CONFIGS }
