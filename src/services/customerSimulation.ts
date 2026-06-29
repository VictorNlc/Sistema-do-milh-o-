import type { CanvasItem } from '../types'
import { isCheckout, isServiceCounter, wallOf } from './heatmapGenerator'

export interface Point {
  x: number
  y: number
  waitDuration?: number // Em segundos
}

export interface CustomerData {
  id: string
  color: string
  path: Point[]
  speed: number // metros por segundo (ex: 1.2 m/s)
}

const COLORS = [
  '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f43f5e', '#6366f1', '#0ea5e9'
]

function getCenter(item: CanvasItem): Point {
  return { x: item.x + item.width / 2, y: item.y + item.height / 2 }
}

function jitter(pt: Point, radius: number): Point {
  const angle = Math.random() * Math.PI * 2
  const r = Math.random() * radius
  return { x: pt.x + Math.cos(angle) * r, y: pt.y + Math.sin(angle) * r }
}

// =====================================================================================
// Modela a "pista de corrida" real de uma farmácia: o cliente entra, sobe por uma lateral
// até o fundo (balcão de atendimento), volta pela outra lateral e sai pelos caixas.
// Assim o fluxo fica mais forte NAS LATERAIS e NOS CAIXAS, e tudo se adapta ao tamanho da
// loja e aos itens posicionados (entrada, balcão, caixas e gôndolas detectados dinamicamente).
// =====================================================================================
export function generateCustomersSimulation(
  items: CanvasItem[],
  storeWidth: number,
  storeHeight: number,
  numCustomers: number = 15
): CustomerData[] {
  const W = Math.max(2, storeWidth)
  const H = Math.max(2, storeHeight)

  const door = items.find(i => i.isDoor && !i.isEmergency)
  const entrance = door ? getCenter(door) : { x: W / 2, y: H - 0.5 }
  const entranceWall = door ? wallOf(entrance, W, H) : 'S'

  const checkouts = items.filter(isCheckout)
  const counters = items.filter(isServiceCounter)
  const gondolas = items.filter(i => i.category === 'GONDOLAS')
  const displays = items.filter(i => i.category === 'PERFUMARIA' || i.category === 'REFRIGERACAO')
  const baskets = items.filter(i => /cest[aã]o/i.test(`${i.name || ''} ${i.label || ''}`))

  const inset = Math.max(0.7, Math.min(1.4, Math.min(W, H) * 0.13))
  const vertical = entranceWall === 'N' || entranceWall === 'S'

  // Coordenadas da pista: "front" = lado da entrada, "back" = lado oposto (fundo/balcão).
  const frontMain = vertical
    ? (entranceWall === 'S' ? H - inset : inset)
    : (entranceWall === 'E' ? W - inset : inset)
  const backMain = vertical
    ? (entranceWall === 'S' ? inset : H - inset)
    : (entranceWall === 'E' ? inset : W - inset)
  // Os dois lados (laterais) ao longo do eixo perpendicular.
  const sideCoords = vertical ? [inset, W - inset] : [inset, H - inset]

  // Waypoint do perímetro: lado (0|1) × extremidade ('front'|'back').
  const perim = (sideIdx: number, end: 'front' | 'back'): Point => {
    const main = end === 'front' ? frontMain : backMain
    const cross = sideCoords[sideIdx]
    return vertical ? { x: cross, y: main } : { x: main, y: cross }
  }

  // Ponto ~0,9 m à frente de um móvel (em direção ao centro da loja), onde o cliente para.
  const frontOf = (it: CanvasItem, wait: number): Point => {
    const c = getCenter(it)
    const dx = W / 2 - c.x, dy = H / 2 - c.y
    const n = Math.hypot(dx, dy) || 1
    return { x: c.x + (dx / n) * 0.9, y: c.y + (dy / n) * 0.9, waitDuration: wait }
  }

  // Móvel mais próximo de uma lateral (para paradas no caminho da pista).
  const nearestDisplayToSide = (sideIdx: number): CanvasItem | null => {
    const pool = [...gondolas, ...displays, ...baskets]
    if (pool.length === 0) return null
    const target = sideCoords[sideIdx]
    let best: CanvasItem | null = null
    let bestD = Infinity
    for (const it of pool) {
      const c = getCenter(it)
      const d = Math.abs((vertical ? c.x : c.y) - target)
      if (d < bestD) { bestD = d; best = it }
    }
    return best
  }

  const customers: CustomerData[] = []

  for (let i = 0; i < numCustomers; i++) {
    const color = COLORS[i % COLORS.length]
    const speed = 0.8 + Math.random() * 0.6 // 0.8 a 1.4 m/s
    const path: Point[] = [jitter(entrance, 0.5)]

    // ~20% fazem compra rápida (só caixa perto da frente); o resto faz a pista completa.
    const quickTrip = Math.random() < 0.2

    const sideUp = Math.random() < 0.5 ? 0 : 1
    const sideDown = 1 - sideUp

    if (quickTrip) {
      // Entra, pega algo perto da frente e vai direto pro caixa.
      const d = nearestDisplayToSide(sideUp)
      if (d) path.push(frontOf(d, 2 + Math.random() * 3))
    } else {
      // Sobe por uma lateral até o fundo.
      path.push(perim(sideUp, 'front'))
      const upStop = nearestDisplayToSide(sideUp)
      if (upStop && Math.random() < 0.7) path.push(frontOf(upStop, 2 + Math.random() * 4))
      path.push(perim(sideUp, 'back'))

      // Balcão de atendimento no fundo (a maioria passa).
      if (counters.length > 0 && Math.random() < 0.8) {
        const c = counters[Math.floor(Math.random() * counters.length)]
        path.push(frontOf(c, 4 + Math.random() * 8))
      }

      // Atravessa para a outra lateral e volta pela frente (fecha a pista).
      path.push(perim(sideDown, 'back'))
      const downStop = nearestDisplayToSide(sideDown)
      if (downStop && Math.random() < 0.55) path.push(frontOf(downStop, 2 + Math.random() * 3))
      path.push(perim(sideDown, 'front'))
    }

    // Caixa (saída).
    if (checkouts.length > 0) {
      const ck = checkouts[Math.floor(Math.random() * checkouts.length)]
      path.push(frontOf(ck, 3 + Math.random() * 5))
    }

    // Saída pela porta.
    path.push(jitter(entrance, 0.6))

    customers.push({ id: `cust-${i}`, color, path, speed })
  }

  return customers
}
