// =====================================================
// heatmapGenerator.ts — Gerador de mapa de calor de fluxo
// Apenas lê posições — não modifica nada
// =====================================================

import type { CanvasItem } from '../types'

export interface HeatPoint {
  x: number   // metros
  y: number
  intensity: number  // 0..1
  radius: number     // metros
}

/** Gera pontos de calor com base na posição da entrada, caixas e corredores */
export function generateHeatmap(
  items: CanvasItem[],
  storeWidth: number,
  storeHeight: number,
): HeatPoint[] {
  const points: HeatPoint[] = []

  // ─── Fontes de calor ─────────────────────────────────────────────────────

  // 1. Porta de entrada — máximo calor
  const door = items.find(i => i.isDoor && !i.isEmergency)
  if (door) {
    const cx = door.x + door.width / 2
    const cy = door.y + door.height / 2
    points.push({ x: cx, y: cy, intensity: 1.0, radius: 2.0 })
    // Corredor principal vindo da entrada (propaga para o centro)
    for (let d = 0.5; d <= Math.min(storeHeight * 0.7, 6); d += 0.5) {
      points.push({ x: cx, y: cy + d, intensity: Math.max(0.2, 0.95 - d * 0.12), radius: 1.5 })
    }
  } else {
    // Sem porta: simular entrada na borda inferior central
    const cx = storeWidth / 2
    const cy = storeHeight - 0.3
    points.push({ x: cx, y: cy, intensity: 0.9, radius: 2.0 })
    for (let d = 0.5; d <= storeHeight * 0.6; d += 0.5) {
      points.push({ x: cx, y: cy - d, intensity: Math.max(0.2, 0.85 - d * 0.1), radius: 1.5 })
    }
  }

  // 2. Caixas / Checkout — alta frequência (saída)
  const checkouts = items.filter(i =>
    i.category === 'BALCOES' &&
    (i.name?.toLowerCase().includes('caixa') || i.name?.toLowerCase().includes('checkout') || i.name?.toLowerCase().includes('cx'))
  )
  for (const cx of checkouts) {
    const px = cx.x + cx.width / 2
    const py = cx.y + cx.height / 2
    points.push({ x: px, y: py, intensity: 0.85, radius: 1.8 })
  }

  // 3. Gôndolas / MIPs — calor médio (circulação)
  const gondolas = items.filter(i => i.category === 'GONDOLAS')
  for (const g of gondolas) {
    const px = g.x + g.width / 2
    const py = g.y + g.height / 2
    points.push({ x: px, y: py, intensity: 0.45, radius: 1.2 })
  }

  // 4. Perfumaria / Refrigeração — calor médio-baixo
  const display = items.filter(i => i.category === 'PERFUMARIA' || i.category === 'REFRIGERACAO')
  for (const d of display) {
    const px = d.x + d.width / 2
    const py = d.y + d.height / 2
    points.push({ x: px, y: py, intensity: 0.35, radius: 1.0 })
  }

  // 5. Cantos da loja — zonas frias (intensidade muito baixa)
  const cornerPad = 1.0
  const corners = [
    { x: cornerPad, y: cornerPad },
    { x: storeWidth - cornerPad, y: cornerPad },
    { x: cornerPad, y: storeHeight - cornerPad },
    { x: storeWidth - cornerPad, y: storeHeight - cornerPad },
  ]
  for (const c of corners) {
    points.push({ x: c.x, y: c.y, intensity: 0.08, radius: 1.5 })
  }

  return points
}

/**
 * Interpola cor do heatmap baseado em intensidade (0..1)
 * Azul frio → Amarelo → Vermelho quente
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
