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

    // 1. Horizontal Gaps (Vertical Corridors along X)
    const xIntervals: { start: number; end: number }[] = []
    let leftLimit = 0
    let rightLimit = storeWidth
    
    items.forEach(item => {
      const bounds = getRotatedBounds(item.x, item.y, item.width, item.height, item.rotation)
      const realW = bounds.width
      const realH = bounds.height
      const x1 = bounds.x
      const y1 = bounds.y

      // Determine if item is placed against any wall (within 0.5m)
      const isWall = !!item.isWallItem || x1 < 0.5 || (x1 + realW) > storeWidth - 0.5 || y1 < 0.5 || (y1 + realH) > storeHeight - 0.5
      
      if (isWall || item.category === 'PERFUMARIA') {
        if (x1 < 0.8) {
          leftLimit = Math.max(leftLimit, x1 + realW)
        }
        if (x1 + realW > storeWidth - 0.8) {
          rightLimit = Math.min(rightLimit, x1)
        }
      }
      
      if (item.category === 'GONDOLAS' && !item.isPillar && !item.isObstacle && !isWall) {
        xIntervals.push({ start: x1, end: x1 + realW })
      }
    })
    
    xIntervals.sort((a, b) => a.start - b.start)
    
    const mergedX: { start: number; end: number }[] = []
    xIntervals.forEach(curr => {
      if (mergedX.length === 0) {
        mergedX.push(curr)
      } else {
        const prev = mergedX[mergedX.length - 1]
        if (curr.start <= prev.end + 0.1) {
          prev.end = Math.max(prev.end, curr.end)
        } else {
          mergedX.push(curr)
        }
      }
    })
    
    const xGaps: { start: number; end: number }[] = []
    let lastX = leftLimit
    mergedX.forEach(idx => {
      if (idx.start > lastX + 0.1) {
        xGaps.push({ start: lastX, end: idx.start })
      }
      lastX = idx.end
    })
    if (rightLimit > lastX + 0.1) {
      xGaps.push({ start: lastX, end: rightLimit })
    }
    
    // 2. Vertical Gaps (Horizontal Corridors along Y)
    const yIntervals: { start: number; end: number }[] = []
    let topLimit = 0
    let bottomLimit = storeHeight
    
    items.forEach(item => {
      const bounds = getRotatedBounds(item.x, item.y, item.width, item.height, item.rotation)
      const realW = bounds.width
      const realH = bounds.height
      const x1 = bounds.x
      const y1 = bounds.y

      // Determine if item is placed against any wall (within 0.5m)
      const isWall = !!item.isWallItem || x1 < 0.5 || (x1 + realW) > storeWidth - 0.5 || y1 < 0.5 || (y1 + realH) > storeHeight - 0.5
      
      if (item.category === 'BALCOES' || isWall) {
        if (y1 < 3.0) {
          topLimit = Math.max(topLimit, y1 + realH)
        }
        if (y1 + realH > storeHeight - 2.0) {
          bottomLimit = Math.min(bottomLimit, y1)
        }
      }
      
      if (item.category === 'GONDOLAS' && !item.isPillar && !item.isObstacle && !isWall) {
        yIntervals.push({ start: y1, end: y1 + realH })
      }
    })
    
    yIntervals.sort((a, b) => a.start - b.start)
    
    const mergedY: { start: number; end: number }[] = []
    yIntervals.forEach(curr => {
      if (mergedY.length === 0) {
        mergedY.push(curr)
      } else {
        const prev = mergedY[mergedY.length - 1]
        if (curr.start <= prev.end + 0.1) {
          prev.end = Math.max(prev.end, curr.end)
        } else {
          mergedY.push(curr)
        }
      }
    })
    
    const yGaps: { start: number; end: number }[] = []
    let lastY = topLimit
    mergedY.forEach(idx => {
      if (idx.start > lastY + 0.1) {
        yGaps.push({ start: lastY, end: idx.start })
      }
      lastY = idx.end
    })
    if (bottomLimit > lastY + 0.1) {
      yGaps.push({ start: lastY, end: bottomLimit })
    }
    
    const elements: React.ReactNode[] = []
    
    // Draw horizontal dimension lines
    xGaps.forEach((gap, idx) => {
      const dist = gap.end - gap.start
      if (dist < 0.4 || dist > 4.0) return
      
      const yPositions = [storeHeight * 0.35, storeHeight * 0.7]
      yPositions.forEach((yVal, yIdx) => {
        const key = `corridor-x-${idx}-${yIdx}`
        const pX1 = gap.start * PIXELS_PER_METER
        const pX2 = gap.end * PIXELS_PER_METER
        const pY = yVal * PIXELS_PER_METER
        const midX = (pX1 + pX2) / 2
        
        elements.push(
          <Group key={key}>
            <Line points={[pX1, pY, pX2, pY]} stroke="#10B981" strokeWidth={1} dash={[3, 3]} opacity={0.65} />
            <Line points={[pX1 + 5, pY - 3, pX1, pY, pX1 + 5, pY + 3]} stroke="#10B981" strokeWidth={1} opacity={0.65} />
            <Line points={[pX2 - 5, pY - 3, pX2, pY, pX2 - 5, pY + 3]} stroke="#10B981" strokeWidth={1} opacity={0.65} />
            <Rect x={midX - 20} y={pY - 6} width={40} height={12} fill="#070F0B" cornerRadius={2} stroke="#10B981" strokeWidth={0.5} opacity={0.9} />
            <Text x={midX - 20} y={pY - 4.5} width={40} text={`${dist.toFixed(2)}m`} fontSize={8} fontStyle="bold" fill="#10B981" align="center" />
          </Group>
        )
      })
    })
    
    // Draw vertical dimension lines
    yGaps.forEach((gap, idx) => {
      const dist = gap.end - gap.start
      if (dist < 0.4 || dist > 4.0) return
      
      const xPositions = [storeWidth * 0.3, storeWidth * 0.7]
      xPositions.forEach((xVal, xIdx) => {
        const key = `corridor-y-${idx}-${xIdx}`
        const pY1 = gap.start * PIXELS_PER_METER
        const pY2 = gap.end * PIXELS_PER_METER
        const pX = xVal * PIXELS_PER_METER
        const midY = (pY1 + pY2) / 2
        
        elements.push(
          <Group key={key}>
            <Line points={[pX, pY1, pX, pY2]} stroke="#10B981" strokeWidth={1} dash={[3, 3]} opacity={0.65} />
            <Line points={[pX - 3, pY1 + 5, pX, pY1, pX + 3, pY1 + 5]} stroke="#10B981" strokeWidth={1} opacity={0.65} />
            <Line points={[pX - 3, pY2 - 5, pX, pY2, pX + 3, pY2 - 5]} stroke="#10B981" strokeWidth={1} opacity={0.65} />
            <Rect x={pX - 20} y={midY - 6} width={40} height={12} fill="#070F0B" cornerRadius={2} stroke="#10B981" strokeWidth={0.5} opacity={0.9} />
            <Text x={pX - 20} y={midY - 4.5} width={40} text={`${dist.toFixed(2)}m`} fontSize={8} fontStyle="bold" fill="#10B981" align="center" />
          </Group>
        )
      })
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
