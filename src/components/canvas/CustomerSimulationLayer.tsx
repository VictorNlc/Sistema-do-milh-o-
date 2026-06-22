import { useEffect, useRef, useState } from 'react'
import { Layer, Group, Circle } from 'react-konva'
import Konva from 'konva'
import { generateCustomersSimulation, CustomerData } from '../../services/customerSimulation'
import type { CanvasItem } from '../../types'

interface CustomerSimulationLayerProps {
  items: CanvasItem[]
  storeWidth: number
  storeHeight: number
  pixelsPerMeter: number
}

// Representa o estado dinâmico de um cliente (não vai no estado React para não causar re-render)
interface CustomerState {
  data: CustomerData
  targetIndex: number
  x: number
  y: number
  waitTimer: number
  done: boolean
}

export default function CustomerSimulationLayer({ items, storeWidth, storeHeight, pixelsPerMeter }: CustomerSimulationLayerProps) {
  const layerRef = useRef<Konva.Layer>(null)
  const animRef = useRef<Konva.Animation | null>(null)
  
  // Guardamos os nós do Konva para atualizar diretamente a posição
  const nodeRefs = useRef<{ [id: string]: Konva.Group | null }>({})
  const stateRefs = useRef<{ [id: string]: CustomerState }>({})

  // Só geramos a simulação uma vez ao montar
  const [customers] = useState(() => generateCustomersSimulation(items, storeWidth, storeHeight, 15))

  useEffect(() => {
    // Inicializar os estados
    customers.forEach(c => {
      const startPt = c.path[0]
      stateRefs.current[c.id] = {
        data: c,
        targetIndex: 1,
        x: startPt.x,
        y: startPt.y,
        waitTimer: 0,
        done: false
      }
      
      const node = nodeRefs.current[c.id]
      if (node) {
        node.x(startPt.x * pixelsPerMeter)
        node.y(startPt.y * pixelsPerMeter)
      }
    })

    const layer = layerRef.current
    if (!layer) return

    animRef.current = new Konva.Animation((frame) => {
      if (!frame) return
      
      const dt = frame.timeDiff / 1000 // Delta time em segundos

      let needsRedraw = false

      Object.values(stateRefs.current).forEach(state => {
        if (state.done) return

        const node = nodeRefs.current[state.data.id]
        if (!node) return

        if (state.waitTimer > 0) {
          state.waitTimer -= dt
          return // Ainda esperando neste waypoint
        }

        const targetPt = state.data.path[state.targetIndex]
        if (!targetPt) {
          // Chegou no fim. Fica invisível ou recomeça
          state.done = true
          node.visible(false)
          needsRedraw = true
          
          // Opcional: Respawn (recomeça o fluxo)
          setTimeout(() => {
            if (!stateRefs.current[state.data.id]) return
            stateRefs.current[state.data.id].targetIndex = 1
            stateRefs.current[state.data.id].x = state.data.path[0].x
            stateRefs.current[state.data.id].y = state.data.path[0].y
            stateRefs.current[state.data.id].waitTimer = 0
            stateRefs.current[state.data.id].done = false
            const n = nodeRefs.current[state.data.id]
            if (n) {
              n.x(state.data.path[0].x * pixelsPerMeter)
              n.y(state.data.path[0].y * pixelsPerMeter)
              n.visible(true)
            }
          }, Math.random() * 5000 + 2000)
          
          return
        }

        // Mover na direção do target
        const dx = targetPt.x - state.x
        const dy = targetPt.y - state.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        // Se chegou perto (menos de 5cm), avança pro próximo
        if (dist < 0.05) {
          state.x = targetPt.x
          state.y = targetPt.y
          state.waitTimer = targetPt.waitDuration || 0
          state.targetIndex++
        } else {
          // Move a uma certa velocidade (metros/segundo)
          const moveDist = state.data.speed * dt
          const ratio = Math.min(moveDist / dist, 1) // Não passa do ponto
          state.x += dx * ratio
          state.y += dy * ratio
          
          // Animação de "caminhar" (wobble)
          const wobble = Math.sin(frame.time / 150) * 0.02
          node.scaleX(1 + wobble)
          node.scaleY(1 - wobble)
        }

        // Atualiza a posição visual
        node.x(state.x * pixelsPerMeter)
        node.y(state.y * pixelsPerMeter)
        
        // Orientação do "corpinho"
        if (dist > 0.01) {
          const angle = Math.atan2(dy, dx) * (180 / Math.PI)
          node.rotation(angle)
        }

        needsRedraw = true
      })
      
      // O Konva.Animation automaticamente atualiza os nós
    }, layer)

    animRef.current.start()

    return () => {
      if (animRef.current) animRef.current.stop()
    }
  }, [customers, pixelsPerMeter])

  return (
    <Layer ref={layerRef} listening={false}>
      {customers.map((c) => (
        <Group 
          key={c.id} 
          ref={(node) => { nodeRefs.current[c.id] = node }}
          // Começa invisível, será posicionado pelo useEffect
          visible={true}
        >
          {/* Ombros */}
          <Circle 
            x={0} 
            y={0} 
            radius={0.25 * pixelsPerMeter} // ~50cm largura
            fill={c.color} 
            shadowColor="rgba(0,0,0,0.3)"
            shadowBlur={5}
            shadowOffset={{ x: 2, y: 2 }}
          />
          {/* Cabeça */}
          <Circle 
            x={0.05 * pixelsPerMeter} // um pouco deslocado pra frente para saber qual é a "frente"
            y={0} 
            radius={0.12 * pixelsPerMeter} // ~24cm largura
            fill="#ffddaa" // Cor de pele neutra
            stroke="rgba(0,0,0,0.1)"
            strokeWidth={1}
          />
        </Group>
      ))}
    </Layer>
  )
}
