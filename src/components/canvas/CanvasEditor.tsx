import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Stage, Layer, Rect, Text, Line, Group } from 'react-konva'
import { useCanvasStore, PIXELS_PER_METER } from '../../store/canvasStore'
import { getRotatedBounds } from '../../utils/geometry'
import CanvasItem from './CanvasItem'
import type Konva from 'konva'
import './CanvasEditor.css'

const WALL_COLOR = '#71717A' // Lighter grey structural walls
const WALL_THICKNESS = 10
const FLOOR_COLOR = '#070F0B'  // Deep dark blueprint green-charcoal
const FLOOR_SHADOW = 'rgba(0,0,0,0.40)'

interface CanvasEditorProps {
  onItemSelect?: (id: string | null) => void
  stageRef?: React.RefObject<Konva.Stage | null>
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

export default function CanvasEditor({ onItemSelect: _onItemSelect, stageRef: externalStageRef }: CanvasEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const internalRef = useRef<Konva.Stage | null>(null)
  const stageRef = externalStageRef ?? internalRef
  const [containerSize, setContainerSize] = useState({ width: 600, height: 500 })
  const [isDraggingOver, setIsDraggingOver] = useState(false)

  // Pinch-to-zoom state
  const lastDist = useRef(0)
  const lastCenter = useRef<Point | null>(null)

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

  const handleItemSelect = useCallback((id: string | null) => {
    setSelectedItem(id)
  }, [setSelectedItem])

  const handleItemDragEnd = useCallback((id: string, x: number, y: number) => {
    updateItemPosition(id, x, y)
  }, [updateItemPosition])

  const canvasW = storeWidth * PIXELS_PER_METER
  const canvasH = storeHeight * PIXELS_PER_METER

  // Responsive container size
  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        const r = containerRef.current.getBoundingClientRect()
        setContainerSize({ width: r.width, height: r.height })
      }
    }
    update()
    const ro = new ResizeObserver(update)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const hasCentered = useRef(false)
  const lastDimensions = useRef({ w: 0, h: 0 })

  // Center stage when dimensions change — Bug Fix: only center initially or when store layout dimensions change
  useEffect(() => {
    if (containerSize.width === 600 && containerSize.height === 500) {
      // Wait for the ResizeObserver to get the actual container size
      return
    }

    const dimChanged = lastDimensions.current.w !== storeWidth || lastDimensions.current.h !== storeHeight
    const shouldCenter = !hasCentered.current || dimChanged

    if (shouldCenter) {
      hasCentered.current = true
      lastDimensions.current = { w: storeWidth, h: storeHeight }
      const cx = (containerSize.width - canvasW * scale) / 2
      const cy = (containerSize.height - canvasH * scale) / 2
      setStagePosition(cx, cy)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeWidth, storeHeight, containerSize.width, containerSize.height])

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
      const box = stage.container().getBoundingClientRect()
      const x = (e.clientX - box.left - stageX) / (PIXELS_PER_METER * scale)
      const y = (e.clientY - box.top - stageY) / (PIXELS_PER_METER * scale)
      addItem(tmpl, x - tmpl.width / 2, y - tmpl.height / 2)
    } catch { /* ignore invalid drops */ }
  }, [addItem, stageX, stageY, scale, stageRef])

  // Grid lines
  const renderGrid = () => {
    if (!showGrid) return null
    const step = gridSize * PIXELS_PER_METER
    const lines = []
    for (let x = 0; x <= canvasW; x += step)
      lines.push(
        <Line
          key={`v${x}`}
          points={[x, 0, x, canvasH]}
          stroke="rgba(58, 230, 160, 0.12)"
          strokeWidth={0.7}
        />
      )
    for (let y = 0; y <= canvasH; y += step)
      lines.push(
        <Line
          key={`h${y}`}
          points={[0, y, canvasW, y]}
          stroke="rgba(58, 230, 160, 0.12)"
          strokeWidth={0.7}
        />
      )
    return lines
  }

  // Ruler marks
  const renderRuler = () => {
    if (!showMeasures) return []
    const marks = []
    for (let x = 0; x <= storeWidth; x++)
      marks.push(<Text key={`rx${x}`} x={x * PIXELS_PER_METER - 8} y={-18} text={`${x}`} fontSize={8} fill="rgba(58, 230, 160, 0.75)" fontStyle="600" />)
    for (let y = 0; y <= storeHeight; y++)
      marks.push(<Text key={`ry${y}`} x={-22} y={y * PIXELS_PER_METER - 5} text={`${y}`} fontSize={8} fill="rgba(58, 230, 160, 0.75)" fontStyle="600" />)
    return marks
  }

  // Draw measurements between gondolas/shelves on the floor
  const renderCorridorMeasures = () => {
    if (!showMeasures || items.length === 0) return null

    interface CorridorGap {
      id: string
      start: number
      end: number
      axis: 'x' | 'y'
      coord: number
      dist: number
    }

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
          })
        }
      }
    })

    const elements: React.ReactNode[] = []

    gaps.forEach(gap => {
      if (gap.axis === 'x') {
        const pX1 = gap.start * PIXELS_PER_METER
        const pX2 = gap.end * PIXELS_PER_METER
        const pY = gap.coord * PIXELS_PER_METER
        const midX = (pX1 + pX2) / 2

        elements.push(
          <Group key={`corridor-x-${gap.id}`}>
            <Line points={[pX1, pY, pX2, pY]} stroke="#10B981" strokeWidth={1} dash={[3, 3]} opacity={0.65} />
            <Line points={[pX1 + 5, pY - 3, pX1, pY, pX1 + 5, pY + 3]} stroke="#10B981" strokeWidth={1} opacity={0.65} />
            <Line points={[pX2 - 5, pY - 3, pX2, pY, pX2 - 5, pY + 3]} stroke="#10B981" strokeWidth={1} opacity={0.65} />
            <Rect x={midX - 18} y={pY - 5} width={36} height={10} fill="#070F0B" cornerRadius={2} stroke="#10B981" strokeWidth={0.5} opacity={0.9} />
            <Text x={midX - 18} y={pY - 3.5} width={36} text={`${gap.dist.toFixed(2)}m`} fontSize={7} fontStyle="bold" fill="#10B981" align="center" />
          </Group>
        )
      } else {
        const pY1 = gap.start * PIXELS_PER_METER
        const pY2 = gap.end * PIXELS_PER_METER
        const pX = gap.coord * PIXELS_PER_METER
        const midY = (pY1 + pY2) / 2

        elements.push(
          <Group key={`corridor-y-${gap.id}`}>
            <Line points={[pX, pY1, pX, pY2]} stroke="#10B981" strokeWidth={1} dash={[3, 3]} opacity={0.65} />
            <Line points={[pX - 3, pY1 + 5, pX, pY1, pX + 3, pY1 + 5]} stroke="#10B981" strokeWidth={1} opacity={0.65} />
            <Line points={[pX - 3, pY2 - 5, pX, pY2, pX + 3, pY2 - 5]} stroke="#10B981" strokeWidth={1} opacity={0.65} />
            <Rect x={pX - 18} y={midY - 5} width={36} height={10} fill="#070F0B" cornerRadius={2} stroke="#10B981" strokeWidth={0.5} opacity={0.9} />
            <Text x={pX - 18} y={midY - 3.5} width={36} text={`${gap.dist.toFixed(2)}m`} fontSize={7} fontStyle="bold" fill="#10B981" align="center" />
          </Group>
        )
      }
    })

    return elements
  }

  // Unused but left for future: activeTool reference
  void activeTool

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

      <Stage
        ref={stageRef}
        width={containerSize.width}
        height={containerSize.height}
        x={stageX}
        y={stageY}
        scaleX={scale}
        scaleY={scale}
        draggable={!selectedItemId}
        onDragEnd={handleStageDragEnd}
        onWheel={handleWheel}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleStageClick}
        onTap={handleStageClick}
      >
        <Layer>
          {/* Floor */}
          <Rect
            name="floor"
            x={0} y={0} width={canvasW} height={canvasH}
            fill={FLOOR_COLOR}
            shadowBlur={20} shadowColor={FLOOR_SHADOW}
            shadowOffsetX={4} shadowOffsetY={8}
          />

          {/* Grid */}
          {renderGrid()}

          {/* Corridor Measures */}
          {renderCorridorMeasures()}

          {/* Ruler */}
          {renderRuler()}

          {/* Walls */}
          <Rect x={-WALL_THICKNESS} y={-WALL_THICKNESS} width={canvasW + 2 * WALL_THICKNESS} height={WALL_THICKNESS} fill={WALL_COLOR} />
          <Rect x={-WALL_THICKNESS} y={canvasH} width={canvasW + 2 * WALL_THICKNESS} height={WALL_THICKNESS} fill={WALL_COLOR} />
          <Rect x={-WALL_THICKNESS} y={-WALL_THICKNESS} width={WALL_THICKNESS} height={canvasH + 2 * WALL_THICKNESS} fill={WALL_COLOR} />
          <Rect x={canvasW} y={-WALL_THICKNESS} width={WALL_THICKNESS} height={canvasH + 2 * WALL_THICKNESS} fill={WALL_COLOR} />

          {/* Dimension labels */}
          <Text
            x={canvasW / 2 - 50} y={canvasH + 10}
            text={`${storeWidth}m`} fontSize={11} fontStyle="700"
            fill="rgba(58, 230, 160, 0.85)"
          />
          <Text
            x={canvasW + 10} y={canvasH / 2 - 15}
            text={`${storeHeight}m`} fontSize={11} fontStyle="700"
            fill="rgba(58, 230, 160, 0.85)" rotation={90}
          />

          {/* North indicator */}
          <Text x={canvasW - 28} y={12} text="N" fontSize={10} fill="rgba(255, 255, 255, 0.45)" fontStyle="bold" />
        </Layer>

        <Layer>
          {items.map((item) => (
            <CanvasItem
              key={item.id}
              item={item}
              isSelected={selectedItemId === item.id}
              isDraggable={selectedItemId === item.id}
              onSelect={handleItemSelect}
              onDragEnd={handleItemDragEnd}
            />
          ))}
        </Layer>
      </Stage>
    </div>
  )
}
