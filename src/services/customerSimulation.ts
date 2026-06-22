import type { CanvasItem } from '../types'

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

// Auxiliar para pegar o centro de um item
function getCenter(item: CanvasItem): Point {
  return { x: item.x + item.width / 2, y: item.y + item.height / 2 }
}

function getRandomPointAround(pt: Point, radius: number): Point {
  const angle = Math.random() * Math.PI * 2
  const r = Math.random() * radius
  return {
    x: pt.x + Math.cos(angle) * r,
    y: pt.y + Math.sin(angle) * r
  }
}

export function generateCustomersSimulation(
  items: CanvasItem[],
  storeWidth: number,
  storeHeight: number,
  numCustomers: number = 15
): CustomerData[] {
  // 1. Identificar Zonas de Interesse (POIs)
  const doors = items.filter(i => i.isDoor && !i.isEmergency)
  const checkouts = items.filter(i => i.category === 'BALCOES' && (i.name?.toLowerCase().includes('caixa') || i.name?.toLowerCase().includes('checkout')))
  const counters = items.filter(i => i.category === 'BALCOES' && i.name?.includes('BA ')) // Balcão de atendimento
  const baskets = items.filter(i => i.name?.toLowerCase().includes('cestão'))
  const gondolas = items.filter(i => i.category === 'GONDOLAS')
  const perfumery = items.filter(i => i.category === 'PERFUMARIA')

  // Se não tem porta, usa o centro embaixo
  const defaultEntrance: Point = doors.length > 0 ? getCenter(doors[0]) : { x: storeWidth / 2, y: storeHeight - 0.5 }
  
  // Caixas (saída) - se não tem, usa perto da porta
  const defaultCheckout = checkouts.length > 0 ? getCenter(checkouts[0]) : defaultEntrance

  const customers: CustomerData[] = []

  for (let i = 0; i < numCustomers; i++) {
    const color = COLORS[i % COLORS.length]
    const speed = 0.8 + Math.random() * 0.6 // 0.8 a 1.4 m/s
    const path: Point[] = []

    // Todos começam perto da porta (deslocados um pouco para não nascerem juntos)
    path.push(getRandomPointAround(defaultEntrance, 0.5))

    // Escolhe um tipo de fluxo baseado em probabilidade
    const rand = Math.random()

    // 1. Visita Cestões (30% de chance de ir em cestão se existir)
    if (rand < 0.3 && baskets.length > 0) {
      const b = baskets[Math.floor(Math.random() * baskets.length)]
      const center = getCenter(b)
      // Ajusta para o cliente ficar na frente do cestão (1m de distância para o centro da loja)
      const dirX = storeWidth / 2 - center.x
      const dirY = storeHeight / 2 - center.y
      const norm = Math.sqrt(dirX * dirX + dirY * dirY) || 1
      path.push({ 
        x: center.x + (dirX / norm) * 0.8, 
        y: center.y + (dirY / norm) * 0.8, 
        waitDuration: 2 + Math.random() * 3 
      })
    }

    // 2. Visita Perfumaria ou Gôndolas
    if (rand < 0.6 && perfumery.length > 0) {
      const p = perfumery[Math.floor(Math.random() * perfumery.length)]
      path.push({ ...getRandomPointAround(getCenter(p), 1.2), waitDuration: 3 + Math.random() * 5 })
    } else if (gondolas.length > 0) {
      const g = gondolas[Math.floor(Math.random() * gondolas.length)]
      path.push({ ...getRandomPointAround(getCenter(g), 1.5), waitDuration: 2 + Math.random() * 4 })
    }

    // 3. Balcão de Medicamentos (50% de chance)
    if (Math.random() < 0.5 && counters.length > 0) {
      const c = counters[Math.floor(Math.random() * counters.length)]
      // Fica na frente do balcão (distância de 1m)
      const center = getCenter(c)
      // Direção para o centro
      const dirX = storeWidth / 2 - center.x
      const dirY = storeHeight / 2 - center.y
      const norm = Math.sqrt(dirX * dirX + dirY * dirY) || 1
      path.push({ 
        x: center.x + (dirX / norm) * 0.8, 
        y: center.y + (dirY / norm) * 0.8, 
        waitDuration: 4 + Math.random() * 8 
      })
    }

    // 4. Checkout
    if (checkouts.length > 0) {
      const ck = checkouts[Math.floor(Math.random() * checkouts.length)]
      const center = getCenter(ck)
      // Fica na frente do caixa
      const dirX = storeWidth / 2 - center.x
      const dirY = storeHeight / 2 - center.y
      const norm = Math.sqrt(dirX * dirX + dirY * dirY) || 1
      path.push({ 
        x: center.x + (dirX / norm) * 1.0, 
        y: center.y + (dirY / norm) * 1.0, 
        waitDuration: 3 + Math.random() * 5 
      })
    }

    // 5. Saída (Volta pra porta)
    path.push(getRandomPointAround(defaultEntrance, 0.5))

    customers.push({ id: `cust-${i}`, color, path, speed })
  }

  return customers
}
