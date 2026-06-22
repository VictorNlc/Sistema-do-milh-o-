import { generateAILayout } from './src/services/heuristicLayoutGenerator'
import { getRotatedBounds } from './src/utils/geometry'
import { WALL_GAP } from './src/config/layoutDimensions'

const EPS = 0.02

function door(w: number, h: number) {
  return { id: 'door1', itemId: 'porta-entrada', name: 'Porta de Entrada', x: w / 2 - 1.0, y: h - 0.15, width: 2.0, height: 0.15, rotation: 0, isDoor: true } as any
}
function doorLeft(w: number, h: number) {
  return { id: 'door1', itemId: 'porta-entrada', name: 'Porta de Entrada', x: 0, y: h / 2 - 1.0, width: 0.15, height: 2.0, rotation: 0, isDoor: true } as any
}

async function run(w: number, h: number, label: string, obstacles: any[] = [], dr: 'B' | 'L' = 'B') {
  const d = dr === 'B' ? door(w, h) : doorLeft(w, h)
  const res = await generateAILayout(w, h, 'premium', [d, ...obstacles], 'normal')
  const modules = res.items.filter((i: any) => !i.isDoor && !i.isEmergency)
  const wallV: any[] = []
  for (const it of modules) {
    const b = getRotatedBounds(it.x!, it.y!, it.width!, it.height!, it.rotation || 0)
    if (b.x < WALL_GAP - EPS || b.y < WALL_GAP - EPS || b.x + b.width > w - WALL_GAP + EPS || b.y + b.height > h - WALL_GAP + EPS)
      wallV.push({ name: it.name, x: +b.x.toFixed(3), y: +b.y.toFixed(3), r: +(b.x + b.width).toFixed(3), b: +(b.y + b.height).toFixed(3), rot: it.rotation })
  }
  const ovl: any[] = []
  for (let i = 0; i < modules.length; i++)
    for (let j = i + 1; j < modules.length; j++) {
      const a = modules[i], c = modules[j]
      const ba = getRotatedBounds(a.x!, a.y!, a.width!, a.height!, a.rotation || 0)
      const bc = getRotatedBounds(c.x!, c.y!, c.width!, c.height!, c.rotation || 0)
      const ox = Math.min(ba.x + ba.width, bc.x + bc.width) - Math.max(ba.x, bc.x)
      const oy = Math.min(ba.y + ba.height, bc.y + bc.height) - Math.max(ba.y, bc.y)
      if (ox > EPS && oy > EPS) ovl.push({ a: a.name, b: c.name, ox: +ox.toFixed(3), oy: +oy.toFixed(3) })
    }
  console.log(`\n=== ${label}: ${w}x${h} | ${modules.length} módulos | valid=${res.valid} ===`)
  console.log(`  wall-violations: ${wallV.length}`)
  wallV.slice(0, 10).forEach(v => console.log('    WALL', JSON.stringify(v)))
  console.log(`  overlaps: ${ovl.length}`)
  ovl.slice(0, 10).forEach(v => console.log('    OVL', JSON.stringify(v)))
}

await run(10, 12, 'medio')
await run(8, 8, 'pequeno')
await run(15, 14, 'grande>100m2')
await run(6, 11, 'estreito')
await run(14, 9, 'grande-baixo')
await run(13, 13, 'entrada-esquerda', [], 'L')
await run(12, 12, 'com-sala-interna', [{ id: 'r1', itemId: 'obstacle-1', name: 'Sala Injeção', x: 0, y: 0, width: 3, height: 2.5, rotation: 0, isObstacle: true }])
await run(12, 12, 'com-pilar', [{ id: 'p1', itemId: 'pilar', name: 'Pilar', x: 6, y: 6, width: 0.3, height: 0.3, rotation: 0, isPillar: true, isObstacle: true }])
console.log('\nDONE')
