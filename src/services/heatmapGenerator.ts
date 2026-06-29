// =====================================================
// heatmapGenerator.ts — Gerador de mapa de calor de fluxo
// Modela o padrão real de circulação de farmácia ("pista de corrida"):
//   entrada → laterais (perímetro) → balcão de atendimento (fundo) → caixas → saída.
// O calor é mais forte nas LATERAIS e nos CAIXAS, e tudo se adapta ao
// tamanho da loja e aos itens posicionados. Apenas lê posições — não modifica nada.
// =====================================================

import type { CanvasItem } from '../types'

export interface HeatPoint {
  x: number   // metros
  y: number
  intensity: number  // 0..1
  radius: number     // metros
}

type Wall = 'N' | 'S' | 'E' | 'W'

const center = (i: CanvasItem) => ({ x: i.x + i.width / 2, y: i.y + i.height / 2 })

const txt = (i: CanvasItem) => `${i.name || ''} ${i.label || ''} ${i.itemId || ''}`.toLowerCase()

// Caixa / checkout (inclui balcão em L de checkout)
export const isCheckout = (i: CanvasItem) =>
  i.category === 'BALCOES' && /caixa|checkout|check out|\bcx\b|caja|balc[aã]o em l|balc[aã]o l|catalog-131/.test(txt(i))

// Balcão de atendimento / medicamentos = qualquer balcão que não seja caixa (destino no fundo)
export const isServiceCounter = (i: CanvasItem) =>
  i.category === 'BALCOES' && !isCheckout(i)

// Em qual parede está um ponto (parede mais próxima)
export function wallOf(pt: { x: number; y: number }, W: number, H: number): Wall {
  const dN = pt.y, dS = H - pt.y, dW = pt.x, dE = W - pt.x
  const m = Math.min(dN, dS, dW, dE)
  if (m === dS) return 'S'
  if (m === dN) return 'N'
  if (m === dW) return 'W'
  return 'E'
}

/** Gera pontos de calor com base no fluxo real (entrada, laterais, balcão de fundo e caixas) */
export function generateHeatmap(
  items: CanvasItem[],
  storeWidth: number,
  storeHeight: number,
): HeatPoint[] {
  const W = Math.max(2, storeWidth)
  const H = Math.max(2, storeHeight)
  const points: HeatPoint[] = []

  // Margem do perímetro (corredor lateral) e espaçamento dos pontos — adaptam ao tamanho.
  const inset = Math.max(0.7, Math.min(1.4, Math.min(W, H) * 0.13))
  const step = Math.max(0.55, Math.min(W, H) / 16)
  const sideRadius = Math.max(1.0, inset * 1.35)

  // ─── Zonas-chave ─────────────────────────────────────────────────────────
  const door = items.find(i => i.isDoor && !i.isEmergency)
  const entrance = door ? center(door) : { x: W / 2, y: H - 0.4 }
  const entranceWall: Wall = door ? wallOf(entrance, W, H) : 'S'

  const checkouts = items.filter(isCheckout)
  const counters = items.filter(isServiceCounter)

  // Eixo principal: vertical quando a entrada está em N/S, horizontal em E/W.
  const vertical = entranceWall === 'N' || entranceWall === 'S'

  // Desenha uma linha de calor (corredor) entre dois pontos.
  const addLine = (x1: number, y1: number, x2: number, y2: number, i1: number, i2: number, radius: number) => {
    const len = Math.hypot(x2 - x1, y2 - y1)
    const n = Math.max(1, Math.round(len / step))
    for (let k = 0; k <= n; k++) {
      const t = k / n
      points.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t, intensity: i1 + (i2 - i1) * t, radius })
    }
  }

  // ─── Pista de circulação (perímetro) ─────────────────────────────────────
  // Laterais (perpendiculares à entrada) = fluxo mais forte; tapeia da frente p/ o fundo.
  if (vertical) {
    const yFront = entranceWall === 'S' ? H - inset : inset
    const yBack = entranceWall === 'S' ? inset : H - inset
    addLine(inset, yFront, inset, yBack, 0.92, 0.62, sideRadius)         // lateral esquerda
    addLine(W - inset, yFront, W - inset, yBack, 0.92, 0.62, sideRadius) // lateral direita
    addLine(inset, yFront, W - inset, yFront, 0.85, 0.85, sideRadius)    // corredor da frente (entrada/caixas)
    addLine(inset, yBack, W - inset, yBack, 0.7, 0.7, sideRadius * 0.95) // corredor do fundo (balcão)
  } else {
    const xFront = entranceWall === 'E' ? W - inset : inset
    const xBack = entranceWall === 'E' ? inset : W - inset
    addLine(xFront, inset, xBack, inset, 0.92, 0.62, sideRadius)         // lateral superior
    addLine(xFront, H - inset, xBack, H - inset, 0.92, 0.62, sideRadius) // lateral inferior
    addLine(xFront, inset, xFront, H - inset, 0.85, 0.85, sideRadius)    // corredor da frente
    addLine(xBack, inset, xBack, H - inset, 0.7, 0.7, sideRadius * 0.95) // corredor do fundo
  }

  // ─── Entrada — ponto mais quente ─────────────────────────────────────────
  points.push({ x: entrance.x, y: entrance.y, intensity: 1.0, radius: Math.max(2.0, sideRadius * 1.5) })

  // ─── Caixas / Checkout — fila concentrada (saída) ────────────────────────
  if (checkouts.length > 0) {
    for (const ck of checkouts) {
      const p = center(ck)
      points.push({ x: p.x, y: p.y, intensity: 0.97, radius: 2.0 })
      // Fila avançando em direção ao centro da loja
      const dirX = W / 2 - p.x, dirY = H / 2 - p.y
      const n = Math.hypot(dirX, dirY) || 1
      points.push({ x: p.x + (dirX / n) * 1.0, y: p.y + (dirY / n) * 1.0, intensity: 0.75, radius: 1.6 })
    }
  } else {
    // Sem caixa identificado: assume área de pagamento perto da entrada
    points.push({ x: entrance.x, y: entrance.y, intensity: 0.9, radius: 2.2 })
  }

  // ─── Balcão de atendimento (fundo) — destino quente ──────────────────────
  for (const c of counters) {
    const p = center(c)
    const dirX = W / 2 - p.x, dirY = H / 2 - p.y
    const n = Math.hypot(dirX, dirY) || 1
    // Calor logo à frente do balcão (onde o cliente espera atendimento)
    points.push({ x: p.x + (dirX / n) * 0.8, y: p.y + (dirY / n) * 0.8, intensity: 0.85, radius: 1.9 })
  }

  // ─── Gôndolas — circulação média ─────────────────────────────────────────
  for (const g of items.filter(i => i.category === 'GONDOLAS')) {
    const p = center(g)
    points.push({ x: p.x, y: p.y, intensity: 0.42, radius: 1.15 })
  }

  // ─── Perfumaria / Refrigeração — circulação média-baixa ──────────────────
  for (const d of items.filter(i => i.category === 'PERFUMARIA' || i.category === 'REFRIGERACAO')) {
    const p = center(d)
    points.push({ x: p.x, y: p.y, intensity: 0.32, radius: 1.0 })
  }

  // ─── Cantos — zonas frias ────────────────────────────────────────────────
  const cp = inset
  for (const c of [[cp, cp], [W - cp, cp], [cp, H - cp], [W - cp, H - cp]]) {
    points.push({ x: c[0], y: c[1], intensity: 0.06, radius: 1.5 })
  }

  return points
}

/**
 * Interpola cor do heatmap baseado em intensidade (0..1)
 * Azul frio → Ciano → Amarelo → Vermelho quente
 */
export function heatColor(intensity: number): { r: number; g: number; b: number; a: number } {
  const t = Math.max(0, Math.min(1, intensity))
  let r, g, b

  if (t < 0.33) {
    // Azul → Ciano
    const f = t / 0.33
    r = Math.round(30 + f * 30)
    g = Math.round(80 + f * 100)
    b = Math.round(200 - f * 50)
  } else if (t < 0.66) {
    // Ciano → Amarelo
    const f = (t - 0.33) / 0.33
    r = Math.round(60 + f * 195)
    g = Math.round(180 + f * 60)
    b = Math.round(150 - f * 140)
  } else {
    // Amarelo → Vermelho
    const f = (t - 0.66) / 0.34
    r = Math.round(255)
    g = Math.round(240 - f * 220)
    b = Math.round(10)
  }

  return { r, g, b, a: Math.round((0.15 + intensity * 0.45) * 255) }
}
