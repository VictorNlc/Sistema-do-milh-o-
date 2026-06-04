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
  const corridorWidth = config.corridorMin

  // Check minimum dimensions
  if (storeWidth < 4 || storeHeight < 4) {
    return {
      items: [],
      messages: ['⚠️ A loja é muito pequena. O mínimo recomendado é 4m x 4m para uma farmácia funcional.'],
      valid: false,
      stats: { usedArea: '0', totalArea: (storeWidth * storeHeight).toFixed(1), corridorMin: corridorWidth },
    }
  }

  const generatedItems: Partial<CanvasItem>[] = []

  // === ZONE PLANNING ===
  const zones = planZones(storeWidth, storeHeight, storeType)

  // === PLACE ITEMS BY ZONE ===
  zones.forEach(zone => {
    const zoneItems = placeItemsInZone(zone, storeType)
    generatedItems.push(...zoneItems)
  })

  // === VALIDATION ===
  const validation = validateLayout(generatedItems, storeWidth, storeHeight, corridorWidth)
  const messages = [...config.tips, ...validation.messages]

  return {
    items: generatedItems,
    messages,
    zones,
    stats: {
      usedArea: generatedItems.reduce((a, i) => a + (i.width ?? 0) * (i.height ?? 0), 0).toFixed(1),
      totalArea: (storeWidth * storeHeight).toFixed(1),
      corridorMin: corridorWidth,
    },
    valid: validation.valid,
  }
}

function planZones(width: number, height: number, storeType: StoreType): AILayoutZone[] {
  const margin = 0.3

  if (storeType === 'premium') {
    return [
      { name: 'Perfumaria (Zona Quente)', x: margin, y: margin, w: width * 0.45 - margin, h: height * 0.5 - margin, type: 'perfumaria' },
      { name: 'Higiene e Cuidados', x: width * 0.5, y: margin, w: width * 0.45 - margin, h: height * 0.4, type: 'higiene' },
      { name: 'Medicamentos', x: margin, y: height * 0.55, w: width * 0.6 - margin, h: height * 0.35, type: 'medicamentos' },
      { name: 'Caixa e Atendimento', x: width * 0.65, y: height * 0.55, w: width * 0.3 - margin, h: height * 0.35, type: 'caixa' },
    ]
  }

  if (storeType === 'manipulacao') {
    return [
      { name: 'Atendimento', x: margin, y: margin, w: width * 0.6 - margin, h: height * 0.3, type: 'atendimento' },
      { name: 'Vendas', x: margin, y: height * 0.35, w: width * 0.6 - margin, h: height * 0.45, type: 'vendas' },
      { name: 'Área Técnica', x: width * 0.65, y: margin, w: width * 0.3 - margin, h: height * 0.7, type: 'manipulacao' },
      { name: 'Caixa', x: width * 0.65, y: height * 0.75, w: width * 0.3 - margin, h: height * 0.15, type: 'caixa' },
    ]
  }

  // Default (popular / completa)
  return [
    { name: 'Zona de Entrada', x: margin, y: margin, w: width - margin * 2, h: 1.0, type: 'entrada' },
    { name: 'Gôndolas Centrais', x: margin, y: 1.5, w: width * 0.65 - margin, h: height * 0.5, type: 'gondolas' },
    { name: 'Parede Direita', x: width * 0.7, y: 1.5, w: width * 0.25 - margin, h: height * 0.5, type: 'parede_dir' },
    { name: 'Atendimento ao Fundo', x: margin, y: height * 0.7, w: width * 0.7 - margin, h: height * 0.22, type: 'atendimento' },
    { name: 'Caixa', x: width * 0.75, y: height * 0.7, w: width * 0.2 - margin, h: height * 0.22, type: 'caixa' },
  ]
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
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    width: template?.width ?? Math.round(w * 10) / 10,
    height: template?.height ?? Math.round(h * 10) / 10,
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

function placeItemsInZone(zone: AILayoutZone, _storeType: StoreType): Partial<CanvasItem>[] {
  const items: Partial<CanvasItem>[] = []

  switch (zone.type) {
    case 'perfumaria': {
      if (zone.w > 2 && zone.h > 2) {
        items.push(makeItem('catalog-31-premium', 'Ilha Perfumaria', '🛍️', zone.x + 0.5, zone.y + 0.5, Math.min(zone.w - 1, 2.0), Math.min(zone.h - 1, 1.5), '#FCE7F3', '#9D174D'))
        items.push(makeItem('catalog-92-premium', 'Expositor Cosméticos', '💄', zone.x, zone.y + zone.h - 0.8, Math.min(zone.w, 2.0), 0.4, '#FBCFE8', '#9D174D'))
      }
      break
    }
    case 'gondolas': {
      const gondolaW = Math.min(zone.w - 0.4, 3.5)
      const spacing = 1.4
      let gy = zone.y
      while (gy + 0.6 < zone.y + zone.h) {
        items.push(makeItem('catalog-31-premium', 'Gôndola', '📦', zone.x + 0.2, gy, gondolaW, 0.6, '#D4B896', '#5C4A2A'))
        gy += spacing
      }
      break
    }
    case 'parede_dir': {
      let wy = zone.y
      while (wy + 0.35 < zone.y + zone.h - 0.5) {
        items.push(makeItem('catalog-21-premium', 'Prateleira', '🗄️', zone.x, wy, Math.min(zone.w, 1.8), 0.3, '#E8D5B7', '#5C4A2A', { isWallItem: true }))
        wy += 1.0
      }
      break
    }
    case 'atendimento': {
      items.push(makeItem('catalog-51-premium', 'Balcão de Atendimento', '🏪', zone.x + 0.2, zone.y + 0.1, Math.min(zone.w - 0.4, 3.0), 0.6, '#DBEAFE', '#1D4ED8'))
      break
    }
    case 'caixa': {
      items.push(makeItem('catalog-61-premium', 'Caixa / PDV', '💳', zone.x + 0.1, zone.y + 0.1, Math.min(zone.w - 0.2, 1.2), 0.7, '#D1FAE5', '#047857'))
      break
    }
    case 'manipulacao': {
      // Bancada de manipulação usando balcão do catálogo
      items.push(makeItem('catalog-55-premium', 'Bancada Manipulação', '🧪', zone.x + 0.1, zone.y + 0.1, zone.w - 0.2, 0.6, '#CFFAFE', '#0891B2'))
      // Prateleiras de insumos
      if (zone.h > 1.2) {
        items.push(makeItem('catalog-21-premium', 'Expositor Insumos', '💊', zone.x + 0.1, zone.y + zone.h - 0.5, zone.w - 0.2, 0.4, '#ECFEFF', '#0E7490'))
      }
      break
    }
    case 'higiene': {
      if (zone.w > 1.5) {
        items.push(makeItem('catalog-21-premium', 'Gôndola Higiene', '📦', zone.x + 0.2, zone.y + 0.2, Math.min(zone.w - 0.4, 2.0), 0.4, '#D4B896', '#5C4A2A'))
        if (zone.h > 1.5) {
          items.push(makeItem('catalog-21-premium', 'Gôndola Higiene 2', '📦', zone.x + 0.2, zone.y + 1.0, Math.min(zone.w - 0.4, 2.0), 0.4, '#D4B896', '#5C4A2A'))
        }
      }
      break
    }
    case 'vendas': {
      const vGondolaW = Math.min(zone.w - 0.4, 3.0)
      let vgy = zone.y
      while (vgy + 0.6 < zone.y + zone.h) {
        items.push(makeItem('catalog-31-premium', 'Gôndola', '📦', zone.x + 0.2, vgy, vGondolaW, 0.6, '#D4B896', '#5C4A2A'))
        vgy += 1.2
      }
      break
    }
    default:
      break
  }

  return items
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
