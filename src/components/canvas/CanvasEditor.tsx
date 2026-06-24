import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Stage, Layer, Rect, Text, Line, Group } from 'react-konva'
import { useCanvasStore, PIXELS_PER_METER } from '../../store/canvasStore'
import { getRotatedBounds } from '../../utils/geometry'
import CanvasItem from './CanvasItem'
import type Konva from 'konva'
import { generateHeatmap, heatColor } from '../../services/heatmapGenerator'
import CustomerSimulationLayer from './CustomerSimulationLayer'
import './CanvasEditor.css'

const WALL_COLOR = '#0B3D2E' // Dark green structural walls
const WALL_THICKNESS = 10
const FLOOR_COLOR = '#ffffff'  // Pure white floor like SketchUp
const FLOOR_SHADOW = 'rgba(11, 61, 46, 0.12)'

interface CorridorGap {
  id: string
  start: number
  end: number
  axis: 'x' | 'y'
  coord: number
  dist: number
  aId?: string // item no lado 'start' (undefined = parede)
  bId?: string // item no lado 'end' (undefined = parede)
}

interface EditingCorridor {
  gap: CorridorGap
  screenX: number
  screenY: number
  value: string
}

interface CanvasEditorProps {
  onItemSelect?: (id: string | null) => void
  stageRef?: React.RefObject<Konva.Stage | null>
  showHeatmap?: boolean
  showSimulation?: boolean
}

interface Point {
  x: number
  y: number
}

const getDistance = (p1: Point, p2: Point) =>
  Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2)

const getCenter = (p1: Point, p2: Point): Point => ({
  x: (p1.x + p2.x) / 2,
  y: (p1.y + p2.y) / 2,
})

export default function CanvasEditor({ onItemSelect: _onItemSelect, stageRef: externalStageRef, showHeatmap = false, showSimulation = false }: CanvasEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const internalRef = useRef<Konva.Stage | null>(null)
  const stageRef = externalStageRef ?? internalRef

  // Specific state selectors to prevent unnecessary re-renders
  const storeWidth = useCanvasStore(state => state.storeWidth)
  const storeHeight = useCanvasStore(state => state.storeHeight)
  const items = useCanvasStore(state => state.items)
  const selectedItemId = useCanvasStore(state => state.selectedItemId)
  const showGrid = useCanvasStore(state => state.showGrid)
  const showMeasures = useCanvasStore(state => state.showMeasures)
  const scale = useCanvasStore(state => state.scale)
  const stageX = useCanvasStore(state => state.stageX)
  const stageY = useCanvasStore(state => state.stageY)
  const gridSize = useCanvasStore(state => state.gridSize)
  const activeTool = useCanvasStore(state => state.activeTool)
  
  const setSelectedItem = useCanvasStore(state => state.setSelectedItem)
  const setScale = useCanvasStore(state => state.setScale)
  const setStagePosition = useCanvasStore(state => state.setStagePosition)
  const updateItemPosition = useCanvasStore(state => state.updateItemPosition)
  const deleteSelected = useCanvasStore(state => state.deleteSelected)
  const addItem = useCanvasStore(state => state.addItem)
  const setStageInstance = useCanvasStore(state => state.setStageInstance)

  // Per-instance handle to THIS editor's Konva stage. The app keeps a hidden
  // desktop + mobile copy mounted at all times sharing a single stageRef, so
  // stageRef.current is ambiguous (resolves to whichever mounted last). We use
  // this dedicated ref to know which stage actually belongs to this instance.
  const myStageRef = useRef<Konva.Stage | null>(null)
  const assignStageRef = useCallback((node: Konva.Stage | null) => {
    myStageRef.current = node
    // Keep the shared/internal RefObject in sync for existing consumers.
    ;(stageRef as React.MutableRefObject<Konva.Stage | null>).current = node

    // Also update stageInstance in the store when the stage mounts and is visible
    if (node && containerRef.current) {
      const r = containerRef.current.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) {
        setStageInstance(node)
      }
    }
  }, [stageRef, setStageInstance])
  const [containerSize, setContainerSize] = useState({ width: 600, height: 500 })
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [editingCorridor, setEditingCorridor] = useState<EditingCorridor | null>(null)
  const corridorCommittedRef = useRef(false)
  const isMobileDevice = typeof window !== 'undefined' && (window.innerWidth <= 767 || /Mobi|Android|iPhone/i.test(navigator.userAgent))

  // Pinch-to-zoom state
  const lastDist = useRef(0)
  const lastCenter = useRef<Point | null>(null)

  const handleItemSelect = useCallback((id: string | null) => {
    setSelectedItem(id)
  }, [setSelectedItem])

  const handleItemDragEnd = useCallback((id: string, x: number, y: number) => {
    updateItemPosition(id, x, y)
  }, [updateItemPosition])

  // Abre o editor inline ao clicar na medida de um corredor.
  // labelCanvasX/Y = posição (em px do layer) do rótulo clicado.
  const handleCorridorLabelClick = useCallback((gap: CorridorGap, labelCanvasX: number, labelCanvasY: number) => {
    const { stageX: sx, stageY: sy, scale: sc } = useCanvasStore.getState()
    corridorCommittedRef.current = false
    setEditingCorridor({
      gap,
      screenX: sx + labelCanvasX * sc,
      screenY: sy + labelCanvasY * sc,
      value: gap.dist.toFixed(2),
    })
  }, [])

  // Aplica o novo tamanho do corredor movendo o item que faz fronteira com ele
  const commitCorridorResize = useCallback(() => {
    if (corridorCommittedRef.current) return
    corridorCommittedRef.current = true
    if (editingCorridor) {
      const { gap, value } = editingCorridor
      const nd = parseFloat(value.replace(',', '.'))
      if (!isNaN(nd) && nd > 0) {
        // Se houver item no lado 'end', move-o; senão move o item do lado 'start'.
        const moveId = gap.bId ?? gap.aId
        const it = moveId ? items.find(i => i.id === moveId) : undefined
        if (it) {
          const delta = gap.bId ? nd - gap.dist : gap.dist - nd
          if (gap.axis === 'x') updateItemPosition(it.id, (it.x ?? 0) + delta, it.y ?? 0)
          else updateItemPosition(it.id, it.x ?? 0, (it.y ?? 0) + delta)
        }
      }
    }
    setEditingCorridor(null)
  }, [editingCorridor, items, updateItemPosition])

  const canvasW = storeWidth * PIXELS_PER_METER
  const canvasH = storeHeight * PIXELS_PER_METER

  // Responsive container size + register this editor's stage as the active one
  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        const r = containerRef.current.getBoundingClientRect()
        setContainerSize({ width: r.width, height: r.height })
        // Only register while this container is actually visible. On desktop the
        // mobile copy is display:none (size 0) and vice-versa, so this ensures the
        // store always points at the on-screen stage — exports capture that one
        // instead of the hidden, zero-sized copy.
        if (r.width > 0 && r.height > 0 && myStageRef.current) {
          setStageInstance(myStageRef.current)
        }
      }
    }
    update()
    const ro = new ResizeObserver(update)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => {
      ro.disconnect()
      // Clear only if the store still points at this instance's stage.
      if (useCanvasStore.getState().stageInstance === myStageRef.current) {
        setStageInstance(null)
      }
    }
  }, [setStageInstance])

  const hasInitialized = useRef(false)

  // Center stage when dimensions change — Bug Fix: only center initially or when store layout dimensions change
  useEffect(() => {
    if (hasInitialized.current) return
    if (!storeWidth || !storeHeight || (containerSize.width === 600 && containerSize.height === 500)) {
      return
    }

    const cx = (containerSize.width - canvasW * scale) / 2
    const cy = (containerSize.height - canvasH * scale) / 2
    setStagePosition(cx, cy)
    hasInitialized.current = true
  }, [storeWidth, storeHeight, containerSize])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName
      if ((e.key === 'Delete' || e.key === 'Backspace') && (tag === 'BODY' || tag === 'CANVAS')) {
        e.preventDefault()
        deleteSelected()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [deleteSelected])

  // Stage drag end (pan)
  const handleStageDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    if (e.target === stageRef.current) {
      setStagePosition(e.target.x(), e.target.y())
    }
  }, [setStagePosition, stageRef])

  // Wheel zoom (desktop)
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const oldScale = scale
    const pointer = stage.getPointerPosition()
    if (!pointer) return
    const scaleBy = 1.08
    const newScale = e.evt.deltaY < 0
      ? Math.min(oldScale * scaleBy, 4)
      : Math.max(oldScale / scaleBy, 0.2)

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    }
    setScale(newScale)
    setStagePosition(
      pointer.x - mousePointTo.x * newScale,
      pointer.y - mousePointTo.y * newScale,
    )
  }, [scale, setScale, setStagePosition, stageRef])

  // Touch: Pinch to zoom
  const handleTouchMove = useCallback((e: Konva.KonvaEventObject<TouchEvent>) => {
    e.evt.preventDefault()
    const touch1 = e.evt.touches[0]
    const touch2 = e.evt.touches[1]

    if (!touch1 || !touch2) return

    const stage = stageRef.current
    if (!stage) return

    const p1: Point = { x: touch1.clientX, y: touch1.clientY }
    const p2: Point = { x: touch2.clientX, y: touch2.clientY }
    const dist = getDistance(p1, p2)
    const center = getCenter(p1, p2)

    if (lastDist.current === 0) {
      lastDist.current = dist
      lastCenter.current = center
      return
    }

    const oldScale = scale
    const newScale = Math.min(Math.max(oldScale * (dist / lastDist.current), 0.2), 4)

    const stagePos = stage.getAbsolutePosition()
    const pointTo: Point = {
      x: (center.x - stagePos.x) / oldScale,
      y: (center.y - stagePos.y) / oldScale,
    }

    setScale(newScale)
    setStagePosition(
      center.x - pointTo.x * newScale,
      center.y - pointTo.y * newScale,
    )

    lastDist.current = dist
    lastCenter.current = center
  }, [scale, setScale, setStagePosition, stageRef])

  const handleTouchEnd = useCallback(() => {
    lastDist.current = 0
    lastCenter.current = null
  }, [])

  // Synchronously prioritize item dragging over stage dragging on pointer down
  const handleStagePointerDown = useCallback((e: Konva.KonvaEventObject<any>) => {
    if (!isMobileDevice) return // Preserve original desktop behavior: Stage remains draggable
    const stage = e.target.getStage()
    if (!stage) return
    const isBackground = e.target === stage || e.target.name() === 'floor'
    stage.draggable(isBackground)
  }, [isMobileDevice])

  // Click/tap on empty area → deselect
  const handleStageClick = useCallback((e: Konva.KonvaEventObject<any>) => {
    if (e.target === e.target.getStage() || e.target.name() === 'floor') {
      setSelectedItem(null)
    }
  }, [setSelectedItem])

  // Drop from library (desktop drag)
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingOver(false)
    const data = e.dataTransfer?.getData('application/json')
    if (!data) return
    try {
      const tmpl = JSON.parse(data)
      const stage = stageRef.current
      if (!stage) return
      const box = containerRef.current?.getBoundingClientRect()
      if (!box) return
      const x = (e.clientX - box.left - stageX) / (PIXELS_PER_METER * scale)
      const y = (e.clientY - box.top - stageY) / (PIXELS_PER_METER * scale)
      addItem(tmpl, x - tmpl.width / 2, y - tmpl.height / 2)
    } catch { /* ignore invalid drops */ }
  }, [addItem, stageX, stageY, scale, stageRef])

  // Grid lines memoized
  const gridLines = useMemo(() => {
    if (!showGrid) return null
    const step = gridSize * PIXELS_PER_METER
    const lines = []
    for (let x = 0; x <= canvasW; x += step)
      lines.push(
        <Line
          key={`v${x}`}
          points={[x, 0, x, canvasH]}
          stroke="rgba(197, 160, 40, 0.18)"
          strokeWidth={0.7}
          listening={false}
        />
      )
    for (let y = 0; y <= canvasH; y += step)
      lines.push(
        <Line
          key={`h${y}`}
          points={[0, y, canvasW, y]}
          stroke="rgba(197, 160, 40, 0.18)"
          strokeWidth={0.7}
          listening={false}
        />
      )
    return lines
  }, [showGrid, gridSize, canvasW, canvasH])

  // Ruler marks memoized
  const rulerMarks = useMemo(() => {
    if (!showMeasures) return []
    const marks = []
    for (let x = 0; x <= storeWidth; x++)
      marks.push(<Text key={`rx${x}`} x={x * PIXELS_PER_METER - 8} y={-18} text={`${x}`} fontSize={8} fill="#0B3D2E" fontStyle="600" opacity={0.8} listening={false} />)
    for (let y = 0; y <= storeHeight; y++)
      marks.push(<Text key={`ry${y}`} x={-22} y={y * PIXELS_PER_METER - 5} text={`${y}`} fontSize={8} fill="#0B3D2E" fontStyle="600" opacity={0.8} listening={false} />)
    return marks
  }, [showMeasures, storeWidth, storeHeight])

  // Outer walls and dimension COTAs memoized
  const outerWallsAndDimensions = useMemo(() => {
    return (
      <Group listening={false}>
        {/* Walls */}
        <Rect x={-WALL_THICKNESS} y={-WALL_THICKNESS} width={canvasW + 2 * WALL_THICKNESS} height={WALL_THICKNESS} fill={WALL_COLOR} />
        <Rect x={-WALL_THICKNESS} y={canvasH} width={canvasW + 2 * WALL_THICKNESS} height={WALL_THICKNESS} fill={WALL_COLOR} />
        <Rect x={-WALL_THICKNESS} y={-WALL_THICKNESS} width={WALL_THICKNESS} height={canvasH + 2 * WALL_THICKNESS} fill={WALL_COLOR} />
        <Rect x={canvasW} y={-WALL_THICKNESS} width={WALL_THICKNESS} height={canvasH + 2 * WALL_THICKNESS} fill={WALL_COLOR} />

        {/* Dimension labels */}
        {/* Horizontal top dimension line */}
        <Line points={[0, -22, canvasW, -22]} stroke="#71717a" strokeWidth={1} />
        <Line points={[0, -28, 0, -16]} stroke="#71717a" strokeWidth={1.2} />
        <Line points={[canvasW, -28, canvasW, -16]} stroke="#71717a" strokeWidth={1.2} />
        <Line points={[5, -25, 0, -22, 5, -19]} stroke="#71717a" strokeWidth={1} />
        <Line points={[canvasW - 5, -25, canvasW, -22, canvasW - 5, -19]} stroke="#71717a" strokeWidth={1} />
        <Rect x={canvasW / 2 - 35} y={-28} width={70} height={12} fill="#FCF9F2" />
        <Text
          x={canvasW / 2 - 35} y={-26}
          width={70}
          text={`${storeWidth.toFixed(2).replace('.', ',')} m`}
          fontSize={9} fontStyle="bold"
          fill="#0B3D2E"
          align="center"
        />

        {/* Vertical right dimension line */}
        <Line points={[canvasW + 22, 0, canvasW + 22, canvasH]} stroke="#71717a" strokeWidth={1} />
        <Line points={[canvasW + 16, 0, canvasW + 28, 0]} stroke="#71717a" strokeWidth={1.2} />
        <Line points={[canvasW + 16, canvasH, canvasW + 28, canvasH]} stroke="#71717a" strokeWidth={1.2} />
        <Line points={[canvasW + 19, 5, canvasW + 22, 0, canvasW + 25, 5]} stroke="#71717a" strokeWidth={1} />
        <Line points={[canvasW + 19, canvasH - 5, canvasW + 22, canvasH, canvasW + 25, canvasH - 5]} stroke="#71717a" strokeWidth={1} />
        <Rect x={canvasW + 16} y={canvasH / 2 - 35} width={12} height={70} fill="#FCF9F2" />
        <Text
          x={canvasW + 29} y={canvasH / 2 - 35}
          text={`${storeHeight.toFixed(2).replace('.', ',')} m`}
          fontSize={9} fontStyle="bold"
          fill="#0B3D2E"
          rotation={90}
        />

        {/* North indicator */}
        <Text x={canvasW - 28} y={12} text="N" fontSize={10} fill="rgba(11, 61, 46, 0.6)" fontStyle="bold" />
      </Group>
    )
  }, [storeWidth, storeHeight, canvasW, canvasH])

  // Draw measurements between gondolas/shelves on the floor
  const corridorMeasures = useMemo(() => {
    if (!showMeasures || items.length === 0) return null

    const obstacleItems = items.filter(item =>
      !item.isDoor && 
      item.itemId !== 'porta-entrada' && 
      item.itemId !== 'porta-saida-emergencia'
    ).map(item => {
      const bounds = getRotatedBounds(item.x ?? 0, item.y ?? 0, item.width ?? 0.3, item.height ?? 0.3, item.rotation ?? 0)
      return {
        id: item.id,
        x1: bounds.x,
        x2: bounds.x + bounds.width,
        y1: bounds.y,
        y2: bounds.y + bounds.height,
      }
    })

    const gaps: CorridorGap[] = []

    // 1. Horizontal Gaps (Measuring along X)
    obstacleItems.forEach(B => {
      // Find closest item A to the left of B that overlaps vertically
      const leftOverlaps = obstacleItems.filter(A => 
        A.id !== B.id &&
        A.x2 <= B.x1 + 0.05 &&
        Math.max(A.y1, B.y1) < Math.min(A.y2, B.y2) - 0.05
      )

      if (leftOverlaps.length > 0) {
        let closest = leftOverlaps[0]
        leftOverlaps.forEach(A => {
          if (A.x2 > closest.x2) closest = A
        })
        const dist = B.x1 - closest.x2
        if (dist >= 0.30 && dist <= 5.00) {
          const overlapY = (Math.max(closest.y1, B.y1) + Math.min(closest.y2, B.y2)) / 2
          gaps.push({
            id: `h-${closest.id}-${B.id}`,
            start: closest.x2,
            end: B.x1,
            axis: 'x',
            coord: overlapY,
            dist,
            aId: closest.id,
            bId: B.id,
          })
        }
      } else {
        // Gap to left wall
        const dist = B.x1
        if (dist >= 0.30 && dist <= 5.00) {
          gaps.push({
            id: `h-leftwall-${B.id}`,
            start: 0,
            end: B.x1,
            axis: 'x',
            coord: (B.y1 + B.y2) / 2,
            dist,
            bId: B.id,
          })
        }
      }
    })

    // Gap from rightmost items to right wall
    obstacleItems.forEach(A => {
      const rightOverlaps = obstacleItems.filter(B => 
        B.id !== A.id &&
        B.x1 >= A.x2 - 0.05 &&
        Math.max(A.y1, B.y1) < Math.min(A.y2, B.y2) - 0.05
      )
      if (rightOverlaps.length === 0) {
        const dist = storeWidth - A.x2
        if (dist >= 0.30 && dist <= 5.00) {
          gaps.push({
            id: `h-${A.id}-rightwall`,
            start: A.x2,
            end: storeWidth,
            axis: 'x',
            coord: (A.y1 + A.y2) / 2,
            dist,
            aId: A.id,
          })
        }
      }
    })

    // 2. Vertical Gaps (Measuring along Y)
    obstacleItems.forEach(B => {
      // Find closest item A above B that overlaps horizontally
      const topOverlaps = obstacleItems.filter(A => 
        A.id !== B.id &&
        A.y2 <= B.y1 + 0.05 &&
        Math.max(A.x1, B.x1) < Math.min(A.x2, B.x2) - 0.05
      )

      if (topOverlaps.length > 0) {
        let closest = topOverlaps[0]
        topOverlaps.forEach(A => {
          if (A.y2 > closest.y2) closest = A
        })
        const dist = B.y1 - closest.y2
        if (dist >= 0.30 && dist <= 5.00) {
          const overlapX = (Math.max(closest.x1, B.x1) + Math.min(closest.x2, B.x2)) / 2
          gaps.push({
            id: `v-${closest.id}-${B.id}`,
            start: closest.y2,
            end: B.y1,
            axis: 'y',
            coord: overlapX,
            dist,
            aId: closest.id,
            bId: B.id,
          })
        }
      } else {
        // Gap to top wall
        const dist = B.y1
        if (dist >= 0.30 && dist <= 5.00) {
          gaps.push({
            id: `v-topwall-${B.id}`,
            start: 0,
            end: B.y1,
            axis: 'y',
            coord: (B.x1 + B.x2) / 2,
            dist,
            bId: B.id,
          })
        }
      }
    })

    // Gap from bottommost items to bottom wall
    obstacleItems.forEach(A => {
      const bottomOverlaps = obstacleItems.filter(B => 
        B.id !== A.id &&
        B.y1 >= A.y2 - 0.05 &&
        Math.max(A.x1, B.x1) < Math.min(A.x2, B.x2) - 0.05
      )
      if (bottomOverlaps.length === 0) {
        const dist = storeHeight - A.y2
        if (dist >= 0.30 && dist <= 5.00) {
          gaps.push({
            id: `v-${A.id}-bottomwall`,
            start: A.y2,
            end: storeHeight,
            axis: 'y',
            coord: (A.x1 + A.x2) / 2,
            dist,
            aId: A.id,
          })
        }
      }
    })

    // Deduplicate gaps to show only one measurement line per corridor
    const uniqueGaps: CorridorGap[] = []
    gaps.forEach(gap => {
      const isDuplicate = uniqueGaps.some(existing => {
        if (existing.axis !== gap.axis) return false
        return Math.abs(existing.start - gap.start) < 0.25 && Math.abs(existing.end - gap.end) < 0.25
      })
      if (!isDuplicate) {
        uniqueGaps.push(gap)
      }
    })

    const elements: React.ReactNode[] = []
    const placedLabels: { x: number; y: number; w: number; h: number }[] = []

    const checkOverlap = (x: number, y: number, w: number, h: number) => {
      const margin = 3
      return placedLabels.some(rect => {
        return (
          x - margin < rect.x + rect.w + margin &&
          x + w + margin > rect.x - margin &&
          y - margin < rect.y + rect.h + margin &&
          y + h + margin > rect.y - margin
        )
      })
    }

    uniqueGaps.forEach(gap => {
      if (gap.axis === 'x') {
        const pX1 = gap.start * PIXELS_PER_METER
        const pX2 = gap.end * PIXELS_PER_METER
        const pY = gap.coord * PIXELS_PER_METER
        const midX = (pX1 + pX2) / 2

        // Try different positions along the line
        const shifts = [0, -30, 30, -60, 60]
        let foundX = null
        for (const shift of shifts) {
          const candidateX = midX + shift
          if (candidateX - 18 >= pX1 + 5 && candidateX + 18 <= pX2 - 5) {
            if (!checkOverlap(candidateX - 18, pY - 5, 36, 10)) {
              foundX = candidateX
              break
            }
          }
        }

        if (foundX !== null) {
          placedLabels.push({ x: foundX - 18, y: pY - 5, w: 36, h: 10 })
          elements.push(
            <Group key={`corridor-x-${gap.id}`}>
              <Line points={[pX1, pY, pX2, pY]} stroke="#C5A028" strokeWidth={1} dash={[3, 3]} opacity={0.65} />
              <Line points={[pX1 + 5, pY - 3, pX1, pY, pX1 + 5, pY + 3]} stroke="#C5A028" strokeWidth={1} opacity={0.65} />
              <Line points={[pX2 - 5, pY - 3, pX2, pY, pX2 - 5, pY + 3]} stroke="#C5A028" strokeWidth={1} opacity={0.65} />
              <Rect
                x={foundX - 18} y={pY - 5} width={36} height={10} fill="#ffffff" cornerRadius={2} stroke="#C5A028" strokeWidth={0.5} opacity={0.9}
                onClick={(e) => { e.cancelBubble = true; handleCorridorLabelClick(gap, foundX, pY) }}
                onTap={(e) => { e.cancelBubble = true; handleCorridorLabelClick(gap, foundX, pY) }}
                onMouseEnter={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = 'pointer' }}
                onMouseLeave={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = 'default' }}
              />
              <Text listening={false} x={foundX - 18} y={pY - 3.5} width={36} text={`${gap.dist.toFixed(2)}m`} fontSize={7} fontStyle="bold" fill="#0B3D2E" align="center" />
            </Group>
          )
        } else {
          elements.push(
            <Group key={`corridor-x-${gap.id}`}>
              <Line points={[pX1, pY, pX2, pY]} stroke="#C5A028" strokeWidth={1} dash={[3, 3]} opacity={0.4} />
            </Group>
          )
        }
      } else {
        const pY1 = gap.start * PIXELS_PER_METER
        const pY2 = gap.end * PIXELS_PER_METER
        const pX = gap.coord * PIXELS_PER_METER
        const midY = (pY1 + pY2) / 2

        // Try different positions along the line
        const shifts = [0, -20, 20, -40, 40]
        let foundY = null
        for (const shift of shifts) {
          const candidateY = midY + shift
          if (candidateY - 5 >= pY1 + 5 && candidateY + 5 <= pY2 - 5) {
            if (!checkOverlap(pX - 18, candidateY - 5, 36, 10)) {
              foundY = candidateY
              break
            }
          }
        }

        if (foundY !== null) {
          placedLabels.push({ x: pX - 18, y: foundY - 5, w: 36, h: 10 })
          elements.push(
            <Group key={`corridor-y-${gap.id}`}>
              <Line points={[pX, pY1, pX, pY2]} stroke="#C5A028" strokeWidth={1} dash={[3, 3]} opacity={0.65} />
              <Line points={[pX - 3, pY1 + 5, pX, pY1, pX + 3, pY1 + 5]} stroke="#C5A028" strokeWidth={1} opacity={0.65} />
              <Line points={[pX - 3, pY2 - 5, pX, pY2, pX + 3, pY2 - 5]} stroke="#C5A028" strokeWidth={1} opacity={0.65} />
              <Rect
                x={pX - 18} y={foundY - 5} width={36} height={10} fill="#ffffff" cornerRadius={2} stroke="#C5A028" strokeWidth={0.5} opacity={0.9}
                onClick={(e) => { e.cancelBubble = true; handleCorridorLabelClick(gap, pX, foundY) }}
                onTap={(e) => { e.cancelBubble = true; handleCorridorLabelClick(gap, pX, foundY) }}
                onMouseEnter={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = 'pointer' }}
                onMouseLeave={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = 'default' }}
              />
              <Text listening={false} x={pX - 18} y={foundY - 3.5} width={36} text={`${gap.dist.toFixed(2)}m`} fontSize={7} fontStyle="bold" fill="#0B3D2E" align="center" />
            </Group>
          )
        } else {
          elements.push(
            <Group key={`corridor-y-${gap.id}`}>
              <Line points={[pX, pY1, pX, pY2]} stroke="#C5A028" strokeWidth={1} dash={[3, 3]} opacity={0.4} />
            </Group>
          )
        }
      }
    })

    return elements
  }, [items, storeWidth, storeHeight, showMeasures, handleCorridorLabelClick])

  // Unused but left for future: activeTool reference
  void activeTool

  const shouldRenderStage = containerSize.width > 0 && containerSize.height > 0

  return (
    <div
      ref={containerRef}
      className={`ce-wrap ${isDraggingOver ? 'ce-drop' : ''}`}
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true) }}
      onDragLeave={() => setIsDraggingOver(false)}
    >
      {isDraggingOver && (
        <div className="ce-drop-overlay">
          <div className="ce-drop-label">Soltar para adicionar</div>
        </div>
      )}

      {shouldRenderStage ? (
        <Stage
          ref={assignStageRef}
          width={containerSize.width}
          height={containerSize.height}
          x={stageX}
          y={stageY}
          scaleX={scale}
          scaleY={scale}
          draggable={!selectedItemId}
          onMouseDown={handleStagePointerDown}
          onTouchStart={handleStagePointerDown}
          onDragEnd={handleStageDragEnd}
          onWheel={handleWheel}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={handleStageClick}
          onTap={handleStageClick}
        >
          <Layer name="background">
            {/* Stage Background (Sketchup style cream backdrop) */}
            <Rect
              x={-1000} y={-1000} width={canvasW + 2000} height={canvasH + 2000}
              fill="#FCF9F2"
              listening={false}
            />
            {/* Floor */}
            <Rect
              name="floor"
              x={0} y={0} width={canvasW} height={canvasH}
              fill={FLOOR_COLOR}
              shadowBlur={20} shadowColor={FLOOR_SHADOW}
              shadowOffsetX={4} shadowOffsetY={8}
            />

            {/* Grid lines (memoized and listening=false) */}
            {gridLines}
          </Layer>

          <Layer name="walls_and_measures" listening={false}>
            {/* Ruler marks */}
            {rulerMarks}

            {/* Walls and COTAs */}
            {outerWallsAndDimensions}
          </Layer>

          <Layer name="corridor_measures">
            {/* Corridor Measures */}
            {corridorMeasures}
          </Layer>

          {/* Heatmap overlay — only rendered when showHeatmap is true */}
          {showHeatmap && (() => {
            const heatPoints = generateHeatmap(items, storeWidth, storeHeight)
            return (
              <Layer listening={false} opacity={1}>
                {heatPoints.map((pt, idx) => {
                  const px = pt.x * PIXELS_PER_METER
                  const py = pt.y * PIXELS_PER_METER
                  const pr = pt.radius * PIXELS_PER_METER
                  const { r, g, b, a } = heatColor(pt.intensity)
                  return (
                    <Rect
                      key={`hp-${idx}`}
                      x={px - pr}
                      y={py - pr}
                      width={pr * 2}
                      height={pr * 2}
                      fillRadialGradientStartPoint={{ x: pr, y: pr }}
                      fillRadialGradientStartRadius={0}
                      fillRadialGradientEndPoint={{ x: pr, y: pr }}
                      fillRadialGradientEndRadius={pr}
                      fillRadialGradientColorStops={[
                        0, `rgba(${r},${g},${b},${(a / 255).toFixed(2)})`,
                        1, 'rgba(0,0,0,0)'
                      ]}
                      listening={false}
                    />
                  )
                })}
                {/* Legend */}
                <Rect x={8} y={canvasH - 68} width={130} height={60} fill="rgba(0,0,0,0.75)" cornerRadius={6} />
                <Text x={14} y={canvasH - 62} text="Mapa de Calor" fontSize={8} fontStyle="bold" fill="rgba(255,255,255,0.8)" />
                <Rect x={14} y={canvasH - 50} width={60} height={6} fillLinearGradientStartPoint={{ x: 0, y: 0 }} fillLinearGradientEndPoint={{ x: 60, y: 0 }} fillLinearGradientColorStops={[0,'rgba(30,80,200,0.9)',0.5,'rgba(255,200,10,0.9)',1,'rgba(255,20,10,0.9)']} cornerRadius={3} />
                <Text x={14} y={canvasH - 40} text="Frio" fontSize={7} fill="rgba(255,255,255,0.45)" />
                <Text x={54} y={canvasH - 40} text="Quente" fontSize={7} fill="rgba(255,255,255,0.45)" />
                <Text x={14} y={canvasH - 28} text="Simulação de fluxo de clientes" fontSize={7} fill="rgba(255,255,255,0.3)" />
              </Layer>
            )
          })()}

          <Layer name="items_layer">
            {items.map((item) => (
              <CanvasItem
                key={item.id}
                item={item}
                isSelected={selectedItemId === item.id}
                isDraggable={isMobileDevice ? true : selectedItemId === item.id}
                onSelect={handleItemSelect}
                onDragEnd={handleItemDragEnd}
              />
            ))}
          </Layer>

          {/* Customer Flow Simulation Layer */}
          {showSimulation && (
            <CustomerSimulationLayer 
              items={items} 
              storeWidth={storeWidth} 
              storeHeight={storeHeight} 
              pixelsPerMeter={PIXELS_PER_METER} 
            />
          )}
        </Stage>
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* Invisible placeholder for hidden desktop/mobile copy */}
        </div>
      )}

      {editingCorridor && (
        <input
          className="ce-corridor-input"
          type="text"
          inputMode="decimal"
          autoFocus
          value={editingCorridor.value}
          style={{ left: editingCorridor.screenX - 28, top: editingCorridor.screenY - 11 }}
          onChange={(e) => setEditingCorridor(ec => (ec ? { ...ec, value: e.target.value } : ec))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitCorridorResize() }
            else if (e.key === 'Escape') { corridorCommittedRef.current = true; setEditingCorridor(null) }
          }}
          onBlur={commitCorridorResize}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
    </div>
  )
}
