// =============================================================================
// ergonomyValidator.ts — Auditoria de ergonomia e acessibilidade para farmácias
// Esta classe é puramente analítica: apenas lê as posições dos itens e não altera nada.
// Aplica regras da norma NBR 9050 e boas práticas de fluxo e segurança em varejo.
// =============================================================================

import type { CanvasItem } from '../types'

export type IssueLevel = 'error' | 'warning' | 'ok'

export interface ErgonomyIssue {
  id: string
  level: IssueLevel
  title: string
  description: string
  affectedIds?: string[]
}

/** 
 * Calcula a caixa delimitadora (Bounding Box - BBox) simplificada de um item no plano 2D.
 * A caixa delimitadora é definida pelas coordenadas do canto superior esquerdo (x1, y1)
 * e do canto inferior direito (x2, y2).
 * Lógica: x1 e y1 correspondem ao pivot original. x2 e y2 correspondem ao pivot somado
 * à largura e altura física do item, respectivamente.
 */
function getBBox(item: CanvasItem) {
  return {
    x1: item.x,
    y1: item.y,
    x2: item.x + item.width,
    y2: item.y + item.height,
  }
}

/** 
 * Calcula a menor distância física (gap) entre as caixas delimitadoras de dois itens.
 * Lógica: 
 * 1. Calcula a distância horizontal (dx) entre os retângulos: se eles se sobrepõem no eixo X, dx é 0.
 *    Caso contrário, dx é a diferença entre a borda esquerda do retângulo mais à direita e a borda direita do retângulo mais à esquerda.
 * 2. Calcula a distância vertical (dy) entre os retângulos de forma análoga.
 * 3. A distância mais curta final é a hipotenusa desse triângulo retângulo formado pelas distâncias dx e dy (fórmula euclidiana).
 */
function rectGap(a: ReturnType<typeof getBBox>, b: ReturnType<typeof getBBox>): number {
  const dx = Math.max(0, Math.max(a.x1, b.x1) - Math.min(a.x2, b.x2))
  const dy = Math.max(0, Math.max(a.y1, b.y1) - Math.min(a.y2, b.y2))
  return Math.sqrt(dx * dx + dy * dy)
}

/** 
 * Determina se dois itens são considerados vizinhos geométricos para fins de corredor de tráfego.
 * Lógica: Se a distância mais curta entre eles for menor que 3.0 metros, eles são qualificados
 * para a análise de corredores de circulação. Distâncias maiores que 3m não influenciam no fluxo imediato.
 */
function areNeighbors(a: ReturnType<typeof getBBox>, b: ReturnType<typeof getBBox>): boolean {
  return rectGap(a, b) < 3.0
}

/**
 * Função principal que realiza a auditoria ergonômica completa do layout atual.
 * Compara as posições de todos os móveis e valida contra as regras da NBR 9050.
 */
export function validateLayout(
  items: CanvasItem[],
  storeWidth: number,
  storeHeight: number,
): ErgonomyIssue[] {
  const issues: ErgonomyIssue[] = []
  
  // Filtra apenas o mobiliário ativo na área de vendas, ignorando portas (entradas),
  // salas internas reservadas (serviços/operacional) e pilares estruturais.
  const furniture = items.filter(i => !i.isPillar && !i.isDoor && !i.isRoom)
  
  // Limites de acessibilidade em metros:
  // - 0.90m é o vão livre mínimo obrigatório para passagem de cadeira de rodas pela NBR 9050.
  // - 1.20m é a largura ideal recomendada para permitir que duas pessoas ou carrinhos circulem em paralelo.
  // - 3.00m é a distância limite ideal para garantir contato visual entre o farmacêutico no balcão e os MIPs.
  const MIN_WHEELCHAIR = 0.90
  const MIN_IDEAL = 1.20
  const MIN_MIP_DIST = 3.0

  // ─── 1. Validação de Corredores de Acessibilidade Críticos (Abaixo de 90cm) ───
  // Lógica: Percorre a matriz de móveis comparando cada par. Se a distância entre eles for
  // menor do que 90cm, os IDs dos móveis afetados são registrados e um erro grave é sinalizado.
  const narrowPairs: Array<{ aId: string; bId: string; gap: number }> = []

  for (let i = 0; i < furniture.length; i++) {
    for (let j = i + 1; j < furniture.length; j++) {
      const a = furniture[i]
      const b = furniture[j]
      const bboxA = getBBox(a)
      const bboxB = getBBox(b)
      if (!areNeighbors(bboxA, bboxB)) continue

      const gap = rectGap(bboxA, bboxB)
      if (gap < MIN_WHEELCHAIR) {
        narrowPairs.push({ aId: a.id, bId: b.id, gap })
      }
    }
  }

  if (narrowPairs.length > 0) {
    const minGap = Math.min(...narrowPairs.map(p => p.gap))
    issues.push({
      id: 'corridor-wheelchair',
      level: 'error',
      title: 'Corredor abaixo do mínimo para cadeirantes',
      description: `${narrowPairs.length} par(es) de módulos com distância inferior a ${MIN_WHEELCHAIR}m. O menor corredor medido é de ${(minGap * 100).toFixed(0)}cm. O mínimo NBR 9050 é de 90cm.`,
      affectedIds: [...new Set(narrowPairs.flatMap(p => [p.aId, p.bId]))],
    })
  }

  // ─── 2. Validação de Corredores Estreitos (Abaixo do Ideal de 1.20m) ───
  // Lógica: Semelhante à primeira verificação, mas seleciona apenas os pares de móveis
  // cujas distâncias estão na faixa intermediária de 0.90m a 1.20m.
  // Esta faixa atende à acessibilidade obrigatória, mas prejudica o conforto do fluxo de carrinhos.
  const snugPairs: Array<{ aId: string; bId: string; gap: number }> = []

  for (let i = 0; i < furniture.length; i++) {
    for (let j = i + 1; j < furniture.length; j++) {
      const a = furniture[i]
      const b = furniture[j]
      const bboxA = getBBox(a)
      const bboxB = getBBox(b)
      if (!areNeighbors(bboxA, bboxB)) continue

      const gap = rectGap(bboxA, bboxB)
      if (gap >= MIN_WHEELCHAIR && gap < MIN_IDEAL) {
        snugPairs.push({ aId: a.id, bId: b.id, gap })
      }
    }
  }

  if (snugPairs.length > 0) {
    issues.push({
      id: 'corridor-ideal',
      level: 'warning',
      title: 'Corredor estreito (abaixo do ideal de 1,20m)',
      description: `${snugPairs.length} corredor(es) entre 90cm e 1,20m. Adequado para cadeirantes, mas dificulta a circulação confortável de clientes com carrinhos.`,
      affectedIds: [...new Set(snugPairs.flatMap(p => [p.aId, p.bId]))],
    })
  }

  // Se nenhum corredor apresentar falha crítica ou de conforto, retorna um status positivo.
  if (narrowPairs.length === 0 && snugPairs.length === 0) {
    issues.push({
      id: 'corridor-ok',
      level: 'ok',
      title: 'Corredores dentro da norma',
      description: `Todos os corredores verificados possuem ao menos ${MIN_IDEAL}m de largura. Excelente para circulação!`,
    })
  }

  // ─── 3. Validação de Obstrução da Zona de Entrada ───────────────────────
  // Lógica: Localiza a porta de entrada principal da farmácia. Cria uma zona virtual livre 
  // com profundidade de 1.5m a partir do limite interno da porta. 
  // Em seguida, verifica se a caixa delimitadora de algum móvel da loja intercepta essa zona virtual.
  // Se houver colisões, gera um erro de segurança/acessibilidade.
  const door = items.find(i => i.isDoor && !i.isEmergency)
  if (door) {
    const CLEAR_DEPTH = 1.5
    const doorBbox = getBBox(door)

    const clearZone = {
      x1: doorBbox.x1 - 0.2, // estende levemente as laterais para segurança extra
      y1: doorBbox.y2,
      x2: doorBbox.x2 + 0.2,
      y2: doorBbox.y2 + CLEAR_DEPTH,
    }

    const blocking = furniture.filter(item => {
      const b = getBBox(item)
      return b.x1 < clearZone.x2 && b.x2 > clearZone.x1 &&
             b.y1 < clearZone.y2 && b.y2 > clearZone.y1
    })

    if (blocking.length > 0) {
      issues.push({
        id: 'entrance-blocked',
        level: 'error',
        title: 'Área de entrada obstruída',
        description: `${blocking.length} item(s) estão dentro dos 1,5m logo após a porta de entrada. Isso dificulta o fluxo de clientes e viola normas de acessibilidade.`,
        affectedIds: blocking.map(i => i.id),
      })
    } else {
      issues.push({
        id: 'entrance-ok',
        level: 'ok',
        title: 'Área de entrada livre',
        description: 'Os 1,5m após a porta de entrada estão desimpedidos. Bom fluxo de chegada!',
      })
    }
  }

  // ─── 4. Validação de Distância do Expositor de MIP ──────────────────────────
  // Lógica: Medicamentos Isentos de Prescrição (MIPs) devem estar visíveis e sob supervisão do
  // farmacêutico responsável. O código filtra todas as gôndolas que possuem a tag MIP e todos os balcões.
  // Em seguida, calcula a menor distância de cada MIP até o balcão mais próximo. 
  // Se for maior que 3.0 metros, aciona um alerta preventivo.
  const mipItems = furniture.filter(i =>
    i.category === 'GONDOLAS' && i.name?.toUpperCase().includes('MIP')
  )
  const balcoes = furniture.filter(i => i.category === 'BALCOES')

  if (mipItems.length > 0 && balcoes.length > 0) {
    const farMips = mipItems.filter(mip => {
      const mipBbox = getBBox(mip)
      const closestBalcao = Math.min(
        ...balcoes.map(b => rectGap(mipBbox, getBBox(b)))
      )
      return closestBalcao > MIN_MIP_DIST
    })

    if (farMips.length > 0) {
      issues.push({
        id: 'mip-far',
        level: 'warning',
        title: 'Expositor de MIP distante do Balcão',
        description: `${farMips.length} expositor(es) de MIP estão a mais de ${MIN_MIP_DIST}m do balcão de atendimento. O farmacêutico deve ter fácil acesso visual aos MIPs.`,
        affectedIds: farMips.map(i => i.id),
      })
    } else {
      issues.push({
        id: 'mip-ok',
        level: 'ok',
        title: 'MIPs próximos ao Balcão',
        description: 'Todos os expositores de MIP estão dentro de 3m do balcão de atendimento. Ótimo!',
      })
    }
  }

  // ─── 5. Auditoria de Taxa de Ocupação de Área ──────────────────────────────
  // Lógica: Calcula a área total da loja (largura * comprimento) e a área de chão ocupada
  // pela soma de todas as projeções de móveis.
  // Uma taxa de ocupação superior a 55% indica que a loja está com excesso de mobiliário,
  // diminuindo os corredores e a mobilidade de forma geral.
  const totalArea = storeWidth * storeHeight
  const usedArea = furniture.reduce((s, i) => s + i.width * i.height, 0)
  const occupancy = (usedArea / totalArea) * 100

  if (occupancy > 55) {
    issues.push({
      id: 'occupancy-high',
      level: 'warning',
      title: `Alta ocupação de área (${occupancy.toFixed(0)}%)`,
      description: `O layout ocupa ${occupancy.toFixed(0)}% da área da loja. O ideal para farmácias é abaixo de 55% para garantir corredores confortáveis.`,
    })
  } else {
    issues.push({
      id: 'occupancy-ok',
      level: 'ok',
      title: `Ocupação adequada (${occupancy.toFixed(0)}%)`,
      description: `A taxa de ocupação está em ${occupancy.toFixed(0)}%, dentro do range ideal (abaixo de 55%) para uma boa experiência de compras.`,
    })
  }

  return issues
}

