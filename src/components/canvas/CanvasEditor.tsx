import { useState, useRef, useCallback, useEffect } from 'react'
import { Stage, Layer, Rect, Text, Line } from 'react-konva'
import { useCanvasStore, PIXELS_PER_METER } from '../../store/canvasStore'
import CanvasItem from './CanvasItem'
import type Konva from 'konva'
import './CanvasEditor.css'

const WALL_COLOR = '#1A2E1E'
const WALL_THICKNESS = 8
const FLOOR_COLOR = '#F5FBF7'
const FLOOR_SHADOW = 'rgba(0,0,0,0.10)'

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

  const {
    storeWidth, storeHeight,
    items, selectedItemId, showGrid, showMeasures,
    scale, stageX, stageY,
    activeTool, snapToGrid: _snapToGrid, gridSize,
    setSelectedItem, setScale, setStagePosition,
    updateItemPosition, addItem, deleteSelected,
  } = useCanvasStore()

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

  // Center stage when dimensions change — Bug Fix: all deps included
  useEffect(() => {
    const cx = (containerSize.width - canvasW * scale) / 2
    const cy = (containerSize.height - canvasH * scale) / 2
    setStagePosition(Math.max(20, cx), Math.max(20, cy))
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
    setStagePosition(e.target.x(), e.target.y())
  }, [setStagePosition])

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
  const handleStageClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
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
          stroke="rgba(16, 124, 63, 0.08)"
          strokeWidth={0.7}
          dash={[2, 6]}
        />
      )
    for (let y = 0; y <= canvasH; y += step)
      lines.push(
        <Line
          key={`h${y}`}
          points={[0, y, canvasW, y]}
          stroke="rgba(16, 124, 63, 0.08)"
          strokeWidth={0.7}
          dash={[2, 6]}
        />
      )
    return lines
  }

  // Ruler marks
  const renderRuler = () => {
    if (!showMeasures) return []
    const marks = []
    for (let x = 0; x <= storeWidth; x++)
      marks.push(<Text key={`rx${x}`} x={x * PIXELS_PER_METER - 8} y={-18} text={`${x}`} fontSize={8} fill={WALL_COLOR} opacity={0.4} />)
    for (let y = 0; y <= storeHeight; y++)
      marks.push(<Text key={`ry${y}`} x={-22} y={y * PIXELS_PER_METER - 5} text={`${y}`} fontSize={8} fill={WALL_COLOR} opacity={0.4} />)
    return marks
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

          {/* Ruler */}
          {renderRuler()}

          {/* Walls */}
          <Rect x={0} y={0} width={canvasW} height={WALL_THICKNESS} fill={WALL_COLOR} />
          <Rect x={0} y={canvasH - WALL_THICKNESS} width={canvasW} height={WALL_THICKNESS} fill={WALL_COLOR} />
          <Rect x={0} y={0} width={WALL_THICKNESS} height={canvasH} fill={WALL_COLOR} />
          <Rect x={canvasW - WALL_THICKNESS} y={0} width={WALL_THICKNESS} height={canvasH} fill={WALL_COLOR} />

          {/* Dimension labels */}
          <Text
            x={canvasW / 2 - 50} y={canvasH + 10}
            text={`${storeWidth}m`} fontSize={11} fontStyle="600"
            fill={WALL_COLOR} opacity={0.6}
          />
          <Text
            x={canvasW + 10} y={canvasH / 2 - 15}
            text={`${storeHeight}m`} fontSize={11} fontStyle="600"
            fill={WALL_COLOR} opacity={0.6} rotation={90}
          />

          {/* North indicator */}
          <Text x={canvasW - 28} y={12} text="N" fontSize={10} fill={WALL_COLOR} opacity={0.4} fontStyle="bold" />
        </Layer>

        <Layer>
          {items.map((item) => (
            <CanvasItem
              key={item.id}
              item={item}
              isSelected={selectedItemId === item.id}
              isDraggable={selectedItemId === item.id}
              onSelect={() => setSelectedItem(item.id)}
              onDragEnd={(x, y) => updateItemPosition(item.id, x, y)}
            />
          ))}
        </Layer>
      </Stage>
    </div>
  )
}
