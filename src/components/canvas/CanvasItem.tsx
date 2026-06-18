import { useRef, useCallback, useState, memo } from 'react'
import { Group, Rect, Text, Circle, Line } from 'react-konva'
import { useCanvasStore, PIXELS_PER_METER } from '../../store/canvasStore'
import { clampItemPosition } from '../../utils/geometry'
import { cleanItemName } from '../../utils/labels'
import type { CanvasItem as CanvasItemType } from '../../types'

interface CanvasItemProps {
  item: CanvasItemType
  isSelected: boolean
  isDraggable: boolean
  onSelect: (id: string) => void
  onDragEnd: (id: string, x: number, y: number) => void
}

const CanvasItem = memo(function CanvasItem({ item, isSelected, isDraggable, onSelect, onDragEnd }: CanvasItemProps) {
  const groupRef = useRef<any>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Use selectors to prevent unnecessary re-renders when other state changes
  const snapToGrid = useCanvasStore(state => state.snapToGrid)
  const gridSize = useCanvasStore(state => state.gridSize)
  const storeWidth = useCanvasStore(state => state.storeWidth)
  const storeHeight = useCanvasStore(state => state.storeHeight)

  const getDisplayLabel = () => {
    if (item.label && item.label !== item.name && !item.label.startsWith('[Premium]') && !item.label.startsWith('[Especial]')) {
      return item.label
    }

    const name = item.name || ''
    const cleanedName = cleanItemName(name)

    if (item.isPillar) return 'PILAR'
    if (item.isEmergency) return 'S. EMERGÊNCIA'
    if (item.isDoor) {
      return cleanedName.toUpperCase().includes('ENTRADA') ? 'P. ENTRADA' : 'P. SAÍDA'
    }

    return cleanedName
  }

  const x = item.x * PIXELS_PER_METER
  const y = item.y * PIXELS_PER_METER
  const w = item.width * PIXELS_PER_METER
  const h = item.height * PIXELS_PER_METER

  const handleSelect = useCallback(() => {
    onSelect(item.id)
  }, [item.id, onSelect])

  const handleDragStart = useCallback(() => {
    setIsDragging(true)
    onSelect(item.id)
  }, [item.id, onSelect])

  const handleDragEnd = useCallback((e: any) => {
    setIsDragging(false)
    const node = e.target
    const newX = node.x() / PIXELS_PER_METER
    const newY = node.y() / PIXELS_PER_METER
    onDragEnd(item.id, newX, newY)
  }, [item.id, onDragEnd])

  const dragBoundFunc = useCallback((pos: { x: number; y: number }) => {
    const node = groupRef.current
    if (!node) return pos

    const stage = node.getStage()
    if (!stage) return pos

    const sScale = stage.scaleX()
    const sX = stage.x()
    const sY = stage.y()

    // Convert absolute screen position back to local coordinates (in pixels)
    const localX = (pos.x - sX) / sScale
    const localY = (pos.y - sY) / sScale
    
    // Convert to meters for easier math
    let targetX = localX / PIXELS_PER_METER
    let targetY = localY / PIXELS_PER_METER
    
    // Snap to grid if enabled
    if (snapToGrid) {
      targetX = Math.round(targetX / gridSize) * gridSize
      targetY = Math.round(targetY / gridSize) * gridSize
    }
    
    // Clamp rotated item boundaries in meters
    const clamped = clampItemPosition(
      targetX,
      targetY,
      item.width,
      item.height,
      item.rotation || 0,
      storeWidth,
      storeHeight
    )
    
    // Convert back to absolute screen coordinates
    return {
      x: clamped.x * PIXELS_PER_METER * sScale + sX,
      y: clamped.y * PIXELS_PER_METER * sScale + sY,
    }
  }, [snapToGrid, gridSize, storeWidth, storeHeight, item.width, item.height, item.rotation])

  const isSmall = w < 25 || h < 25
  const isPillar = item.isPillar ?? item.id?.includes('pilar')
  const isDoor = item.isDoor ?? item.id?.includes('porta')
  const isRoom = item.isRoom ?? (item.category === 'SERVICOS' || item.category === 'OPERACIONAL')
  const isRound = item.isRound ?? item.id?.includes('display')

  // 1. PILLAR
  if (isPillar) {
    return (
      <Group
        ref={groupRef}
        x={x} y={y}
        draggable={isDraggable}
        onClick={handleSelect}
        onTap={handleSelect}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        dragBoundFunc={dragBoundFunc}
        rotation={item.rotation || 0}
      >
        <Rect
          width={w} height={h}
          fill="#1E293B"
          stroke={isSelected ? '#10B981' : '#0F172A'}
          strokeWidth={isSelected ? 2 : 1.5}
          cornerRadius={1}
          shadowEnabled={!isDragging}
          shadowBlur={isSelected ? 8 : 1}
          shadowColor={isSelected ? '#10B981' : 'rgba(0,0,0,0.1)'}
        />
        <Line points={[0, 0, w, h]} stroke="#475569" strokeWidth={1} opacity={0.6} />
        <Line points={[w, 0, 0, h]} stroke="#475569" strokeWidth={1} opacity={0.6} />
        {isSelected && (
          <Text
            x={w + 6} y={2}
            text={`${item.width}m × ${item.height}m`}
            fontSize={9}
            fill="#10B981"
            fontStyle="600"
          />
        )}
      </Group>
    )
  }

  // 2. DOOR (Sliding Door Style)
  if (isDoor) {
    const strokeColor = item.isEmergency ? '#EF4444' : (item.strokeColor || '#059669')

    return (
      <Group
        ref={groupRef}
        x={x} y={y}
        draggable={isDraggable}
        onClick={handleSelect}
        onTap={handleSelect}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        dragBoundFunc={dragBoundFunc}
        rotation={item.rotation || 0}
      >
        {/* Door opening line */}
        <Line points={[0, 0, w, 0]} stroke="#CBD5E1" strokeWidth={1.5} dash={[3, 3]} />
        
        {/* Sliding panels */}
        <Line points={[0, -2.5, w / 2, -2.5]} stroke={strokeColor} strokeWidth={3.5} lineCap="round" />
        <Line points={[w / 2, 2.5, w, 2.5]} stroke={strokeColor} strokeWidth={3.5} lineCap="round" />
        
        {/* Door stops */}
        <Line points={[0, -5, 0, 5]} stroke={strokeColor} strokeWidth={2} />
        <Line points={[w, -5, w, 5]} stroke={strokeColor} strokeWidth={2} />
        
        {/* Direction indicators */}
        <Line points={[w / 4 - 4, -5.5, w / 4, -2.5, w / 4 - 4, 0.5]} stroke={strokeColor} strokeWidth={1} opacity={0.7} />
        <Line points={[3 * w / 4 + 4, 5.5, 3 * w / 4, 2.5, 3 * w / 4 + 4, -0.5]} stroke={strokeColor} strokeWidth={1} opacity={0.7} />

        <Text
          x={w * 0.1}
          y={-18}
          width={w * 0.8}
          text={item.isEmergency ? `⚠️ EMERGÊNCIA` : getDisplayLabel()}
          fontSize={8}
          fontStyle="600"
          fill={strokeColor}
          align="center"
        />
        {isSelected && (
          <Text
            x={w + 6} y={2}
            text={`${item.width}m`}
            fontSize={9}
            fill="#10B981"
            fontStyle="600"
          />
        )}
      </Group>
    )
  }

  // 2.5. CHECKOUT L (L-shaped checkout)
  const isCheckoutL = item.itemId?.includes('catalog-131') || item.name?.toLowerCase().includes('checkout em l') || item.name?.toLowerCase().includes('checkout l')
  if (isCheckoutL) {
    const strokeBorderColor = isSelected ? '#10B981' : (item.strokeColor || '#2563EB')
    const strokeBorderWidth = isSelected ? 2 : 1.2
    const fill = item.fillColor || '#DBEAFE'
    const t = 0.4 * PIXELS_PER_METER

    // Points for L-shape polygon
    // Corner is at (0, 0)
    // Horizontal part: w wide, t high
    // Vertical part: t wide, h high
    const points = [
      0, 0,
      w, 0,
      w, t,
      t, t,
      t, h,
      0, h
    ]

    return (
      <Group
        ref={groupRef}
        x={x} y={y}
        draggable={isDraggable}
        onClick={handleSelect}
        onTap={handleSelect}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        dragBoundFunc={dragBoundFunc}
        rotation={item.rotation || 0}
      >
        <Line
          points={points}
          closed={true}
          fill={fill}
          stroke={strokeBorderColor}
          strokeWidth={strokeBorderWidth}
          shadowEnabled={!isDragging}
          shadowBlur={isSelected ? 12 : 2}
          shadowColor={isSelected ? '#10B981' : 'rgba(15, 23, 42, 0.05)'}
          shadowOffsetY={isSelected ? 2 : 1}
        />

        {/* Outer label */}
        <Text
          x={2}
          y={t / 2 - 4.5}
          width={w - 4}
          text={getDisplayLabel()}
          fontSize={8.5}
          fontStyle="700"
          fill={item.strokeColor || '#1E293B'}
          align="center"
          verticalAlign="middle"
          ellipsis={true}
          wrap="none"
        />

        {/* Selected overlay */}
        {isSelected && (
          <Text
            x={w / 2 - 25}
            y={h + 6}
            width={50}
            text={`${item.width}m × ${item.height}m`}
            fontSize={8.5}
            fontStyle="700"
            fill="#065F46"
            align="center"
          />
        )}

        {/* Selection handles */}
        {isSelected && (
          <>
            <Circle x={0} y={0} radius={3.5} fill="#10B981" stroke="white" strokeWidth={1} />
            <Circle x={w} y={0} radius={3.5} fill="#10B981" stroke="white" strokeWidth={1} />
            <Circle x={w} y={t} radius={3.5} fill="#10B981" stroke="white" strokeWidth={1} />
            <Circle x={t} y={t} radius={3.5} fill="#10B981" stroke="white" strokeWidth={1} />
            <Circle x={t} y={h} radius={3.5} fill="#10B981" stroke="white" strokeWidth={1} />
            <Circle x={0} y={h} radius={3.5} fill="#10B981" stroke="white" strokeWidth={1} />
          </>
        )}
      </Group>
    )
  }

  // 3. GENERAL RETAIL ITEMS
  const strokeBorderColor = isSelected ? '#10B981' : (item.strokeColor || '#475569')
  const strokeBorderWidth = isSelected ? 2 : 1.2
  const cRadius = isRoom ? 5 : (isRound ? Math.min(w, h) / 2 : 3)

  return (
    <Group
      ref={groupRef}
      x={x} y={y}
      draggable={isDraggable}
      onClick={handleSelect}
      onTap={handleSelect}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      dragBoundFunc={dragBoundFunc}
      rotation={item.rotation || 0}
    >
      <Rect
        width={w} height={h}
        fill={item.fillColor || '#E2E8F0'}
        stroke={strokeBorderColor}
        strokeWidth={strokeBorderWidth}
        cornerRadius={cRadius}
        shadowEnabled={!isDragging}
        shadowBlur={isSelected ? 12 : 2}
        shadowColor={isSelected ? '#10B981' : 'rgba(15, 23, 42, 0.05)'}
        shadowOffsetY={isSelected ? 2 : 1}
      />

      {/* A. GONDOLAS: Shelf lines */}
      {!isSmall && item.category === 'GONDOLAS' && (
        w >= h ? (
          <>
            <Line points={[0, h * 0.25, w, h * 0.25]} stroke={item.strokeColor} strokeWidth={0.8} opacity={0.45} />
            <Line points={[0, h * 0.75, w, h * 0.75]} stroke={item.strokeColor} strokeWidth={0.8} opacity={0.45} />
          </>
        ) : (
          <>
            <Line points={[w * 0.25, 0, w * 0.25, h]} stroke={item.strokeColor} strokeWidth={0.8} opacity={0.45} />
            <Line points={[w * 0.75, 0, w * 0.75, h]} stroke={item.strokeColor} strokeWidth={0.8} opacity={0.45} />
          </>
        )
      )}

      {/* B. BALCOES: Countertop inset */}
      {!isSmall && item.category === 'BALCOES' && (
        <Rect
          x={4} y={4}
          width={w - 8} height={h - 8}
          stroke={item.strokeColor}
          strokeWidth={0.8}
          cornerRadius={2}
          opacity={0.4}
        />
      )}

      {/* C. REFRIGERACAO: Double frame */}
      {!isSmall && item.category === 'REFRIGERACAO' && (
        <>
          <Rect x={3} y={3} width={w - 6} height={h - 6} stroke={item.strokeColor} strokeWidth={0.8} opacity={0.5} />
          <Line points={[w * 0.25, h * 0.25, w * 0.75, h * 0.75]} stroke={item.strokeColor} strokeWidth={1.2} opacity={0.3} />
          <Line points={[w * 0.38, h * 0.25, w * 0.75, h * 0.62]} stroke={item.strokeColor} strokeWidth={0.8} opacity={0.2} />
        </>
      )}

      {/* D. PERFUMARIA: Circular details */}
      {!isSmall && item.category === 'PERFUMARIA' && (
        isRound ? (
          <>
            <Circle x={w / 2} y={h / 2} radius={Math.min(w, h) / 2 - 4} stroke={item.strokeColor} strokeWidth={0.7} opacity={0.5} />
            <Circle x={w / 2} y={h / 2} radius={Math.min(w, h) / 4} stroke={item.strokeColor} strokeWidth={0.5} opacity={0.3} />
          </>
        ) : (
          <Rect x={4} y={4} width={w - 8} height={h - 8} stroke={item.strokeColor} strokeWidth={0.8} dash={[2, 2]} opacity={0.4} />
        )
      )}

      {/* E. ROOMS: Double wall boundary */}
      {!isSmall && isRoom && (
        <Rect x={5} y={5} width={w - 10} height={h - 10} stroke={item.strokeColor} strokeWidth={0.7} dash={[4, 2]} opacity={0.55} />
      )}

      {/* F. ACCESSIBILITY: Ramp slopes */}
      {!isSmall && item.category === 'ACESSIBILIDADE' && item.id?.includes('rampa') && (
        <>
          <Line points={[w * 0.2, h * 0.5, w * 0.5, h * 0.2, w * 0.8, h * 0.5]} stroke={item.strokeColor} strokeWidth={1} opacity={0.4} />
          <Line points={[w * 0.2, h * 0.7, w * 0.5, h * 0.4, w * 0.8, h * 0.7]} stroke={item.strokeColor} strokeWidth={1} opacity={0.4} />
        </>
      )}

      {/* Label */}
      <Text
        x={2}
        y={Math.max(1, h / 2 - 4.5)}
        width={Math.max(10, w - 4)}
        text={getDisplayLabel()}
        fontSize={w > 120 ? 9.5 : (w > 65 ? 8.5 : (w > 45 ? 7 : 6))}
        fontStyle="700"
        fill={item.strokeColor || '#1E293B'}
        align="center"
        verticalAlign="middle"
        ellipsis={true}
        wrap="none"
      />

      {/* Dimension overlay when selected */}
      {isSelected && (
        <Text
          x={w / 2 - 25}
          y={h + 6}
          width={50}
          text={`${item.width}m × ${item.height}m`}
          fontSize={8.5}
          fontStyle="700"
          fill="#065F46"
          align="center"
        />
      )}

      {/* Corner selection handles */}
      {isSelected && (
        <>
          <Circle x={0} y={0} radius={3.5} fill="#10B981" stroke="white" strokeWidth={1} />
          <Circle x={w} y={0} radius={3.5} fill="#10B981" stroke="white" strokeWidth={1} />
          <Circle x={0} y={h} radius={3.5} fill="#10B981" stroke="white" strokeWidth={1} />
          <Circle x={w} y={h} radius={3.5} fill="#10B981" stroke="white" strokeWidth={1} />
        </>
      )}
    </Group>
  )
})

export default CanvasItem
