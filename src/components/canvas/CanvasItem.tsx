import { useRef, useCallback } from 'react'
import { Group, Rect, Text, Circle, Line } from 'react-konva'
import { useCanvasStore, PIXELS_PER_METER } from '../../store/canvasStore'
import type { CanvasItem as CanvasItemType } from '../../types'

interface CanvasItemProps {
  item: CanvasItemType
  isSelected: boolean
  isDraggable: boolean
  onSelect: () => void
  onDragEnd: (x: number, y: number) => void
}

export default function CanvasItem({ item, isSelected, isDraggable, onSelect, onDragEnd }: CanvasItemProps) {
  const groupRef = useRef(null)
  const { snapToGrid, gridSize } = useCanvasStore()

  const x = item.x * PIXELS_PER_METER
  const y = item.y * PIXELS_PER_METER
  const w = item.width * PIXELS_PER_METER
  const h = item.height * PIXELS_PER_METER

  const handleDragEnd = useCallback((e: { target: { x: () => number; y: () => number } }) => {
    const node = e.target
    const newX = node.x() / PIXELS_PER_METER
    const newY = node.y() / PIXELS_PER_METER
    onDragEnd(newX, newY)
  }, [onDragEnd])

  const handleDragMove = useCallback((e: { target: { x: (v?: number) => number; y: (v?: number) => number } }) => {
    if (!snapToGrid) return
    const node = e.target
    const snap = gridSize * PIXELS_PER_METER
    node.x(Math.round(node.x() / snap) * snap)
    node.y(Math.round(node.y() / snap) * snap)
  }, [snapToGrid, gridSize])

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
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={handleDragEnd}
        onDragMove={handleDragMove}
        rotation={item.rotation || 0}
      >
        <Rect
          width={w} height={h}
          fill="#1E293B"
          stroke={isSelected ? '#10B981' : '#0F172A'}
          strokeWidth={isSelected ? 2 : 1.5}
          cornerRadius={1}
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

  // 2. DOOR
  if (isDoor) {
    const swingPoints: number[] = []
    const steps = 16
    for (let i = 0; i <= steps; i++) {
      const angle = (Math.PI / 2) * (i / steps)
      const px = w * Math.sin(angle)
      const py = -w * Math.cos(angle)
      swingPoints.push(px, py)
    }

    const strokeColor = item.isEmergency ? '#EF4444' : (item.strokeColor || '#059669')

    return (
      <Group
        ref={groupRef}
        x={x} y={y}
        draggable={isDraggable}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={handleDragEnd}
        onDragMove={handleDragMove}
        rotation={item.rotation || 0}
      >
        <Line points={[0, 0, w, 0]} stroke="#CBD5E1" strokeWidth={1} dash={[3, 3]} />
        <Line points={[0, 0, 0, -w]} stroke={strokeColor} strokeWidth={2.5} />
        <Line points={swingPoints} stroke={strokeColor} strokeWidth={1} dash={[2, 3]} opacity={0.8} />
        <Circle x={0} y={0} radius={2.5} fill={strokeColor} />
        <Text
          x={w * 0.1}
          y={-w * 0.7}
          width={w * 0.8}
          text={item.isEmergency ? `⚠️ EMERGÊNCIA` : item.label || item.name}
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

  // 3. GENERAL RETAIL ITEMS
  const strokeBorderColor = isSelected ? '#10B981' : (item.strokeColor || '#475569')
  const strokeBorderWidth = isSelected ? 2 : 1.2
  const cRadius = isRoom ? 5 : (isRound ? Math.min(w, h) / 2 : 3)

  return (
    <Group
      ref={groupRef}
      x={x} y={y}
      draggable={isDraggable}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={handleDragEnd}
      onDragMove={handleDragMove}
      rotation={item.rotation || 0}
    >
      <Rect
        width={w} height={h}
        fill={item.fillColor || '#E2E8F0'}
        stroke={strokeBorderColor}
        strokeWidth={strokeBorderWidth}
        cornerRadius={cRadius}
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
      {!isSmall && (
        <Text
          x={6}
          y={h / 2 - 6}
          width={w - 12}
          text={item.label || item.name}
          fontSize={w > 65 ? 10 : 8.5}
          fontStyle="600"
          fill={item.strokeColor || '#1E293B'}
          align="center"
          verticalAlign="middle"
          ellipsis={true}
          wrap="none"
        />
      )}

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
}
