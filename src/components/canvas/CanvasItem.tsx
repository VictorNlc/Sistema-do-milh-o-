import { useRef, useCallback, useState, useEffect, memo } from 'react'
import { Group, Rect, Text, Circle, Line, Image as KonvaImage } from 'react-konva'
import { useCanvasStore, PIXELS_PER_METER } from '../../store/canvasStore'
import { clampItemPosition, getRotatedBounds, checkItemsCollision } from '../../utils/geometry'
import { cleanItemName } from '../../utils/labels'
import type { CanvasItem as CanvasItemType } from '../../types'
import { getFurnitureIcon } from '../../utils/furnitureIcons'

interface CanvasItemProps {
  item: CanvasItemType
  isSelected: boolean
  isDraggable: boolean
  onSelect: (id: string, isCtrl?: boolean) => void
  onDragEnd: (id: string, x: number, y: number) => void
}

const CanvasItem = memo(function CanvasItem({ item, isSelected, isDraggable, onSelect, onDragEnd }: CanvasItemProps) {
  const groupRef = useRef<any>(null)
  const drawingsGroupRef = useRef<any>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [imgObj, setImgObj] = useState<HTMLImageElement | null>(null)
  
  useEffect(() => {
    const iconUrl = getFurnitureIcon(item)
    if (iconUrl) {
      const img = new window.Image()
      img.src = iconUrl
      img.onload = () => {
        setImgObj(img)
      }
      img.onerror = () => {
        setImgObj(null)
      }
    } else {
      setImgObj(null)
    }
  }, [item.name, item.code, item.id, item.icon])
  
  const selectedItemIds = useCanvasStore(state => state.selectedItemIds)
  const selectedItemsStartPos = useRef<Record<string, { x: number; y: number }>>({})

  // Use selectors to prevent unnecessary re-renders when other state changes
  const snapToGrid = useCanvasStore(state => state.snapToGrid)
  const gridSize = useCanvasStore(state => state.gridSize)
  const storeWidth = useCanvasStore(state => state.storeWidth)
  const storeHeight = useCanvasStore(state => state.storeHeight)
  const deleteItem = useCanvasStore(state => state.deleteItem)

  const x = (item.x ?? 0) * PIXELS_PER_METER
  const y = (item.y ?? 0) * PIXELS_PER_METER
  const w = (item.width ?? 0.5) * PIXELS_PER_METER
  const h = (item.height ?? 0.5) * PIXELS_PER_METER

  const isSmall = isNaN(w) || isNaN(h) || w < 25 || h < 25
  const isPillar = item.isPillar ?? item.id?.includes('pilar')
  const isDoor = item.isDoor ?? item.id?.includes('porta')
  const isRoom = item.isRoom ?? (item.category === 'SERVICOS' || item.category === 'OPERACIONAL')
  const isRound = item.isRound ?? item.id?.includes('display')
  const isObstacle = item.isObstacle ?? item.id?.includes('obstacle')

  const itemKey = `${item.name}-${item.label}-${item.fillColor}-${item.strokeColor}-${item.category}-${item.itemId}-${item.isEmergency}-${isPillar}-${isDoor}-${isRoom}-${isRound}-${isObstacle}`

  useEffect(() => {
    const node = drawingsGroupRef.current
    if (!node) return

    // Cache when not selected, not dragging, and dimensions are valid
    const shouldCache = !isSelected && !isDragging && !isNaN(w) && !isNaN(h) && w > 0 && h > 0

    // Small timeout to make sure elements are rendered on canvas first
    const timer = setTimeout(() => {
      if (!drawingsGroupRef.current) return
      if (shouldCache) {
        try {
          drawingsGroupRef.current.clearCache()
          drawingsGroupRef.current.cache({
            x: -20,
            y: -30,
            width: w + 40,
            height: h + 60,
            pixelRatio: window.devicePixelRatio || 2,
          })
          drawingsGroupRef.current.getLayer()?.batchDraw()
        } catch (e) {
          console.warn('Failed to cache item:', item.name, e)
        }
      } else {
        try {
          drawingsGroupRef.current.clearCache()
          drawingsGroupRef.current.getLayer()?.batchDraw()
        } catch {}
      }
    }, 40)

    return () => {
      clearTimeout(timer)
      if (node) {
        try {
          node.clearCache()
        } catch {}
      }
    }
  }, [isSelected, isDragging, w, h, itemKey])

  const getDisplayLabel = () => {
    if (item.label && item.label !== item.name && !item.label.startsWith('[Premium]') && !item.label.startsWith('[Especial]')) {
      return item.label
    }

    const name = item.name || ''
    const cleanedName = cleanItemName(name)

    if (isPillar) return 'PILAR'
    if (item.isEmergency) return 'S. EMERGÊNCIA'
    if (isDoor) {
      return cleanedName.toUpperCase().includes('ENTRADA') ? 'P. ENTRADA' : 'P. SAÍDA'
    }

    return cleanedName
  }

  const isMobileDevice = typeof window !== 'undefined' && (window.innerWidth <= 767 || /Mobi|Android|iPhone/i.test(navigator.userAgent))

  const handleSelect = useCallback((e: any) => {
    if (isMobileDevice) return
    const isCtrl = e.evt?.ctrlKey || e.evt?.metaKey
    onSelect(item.id, isCtrl)
  }, [item.id, onSelect, isMobileDevice])

  const handleDblClick = useCallback((e: any) => {
    const isCtrl = e.evt?.ctrlKey || e.evt?.metaKey
    onSelect(item.id, isCtrl)
  }, [item.id, onSelect])

  const [isOutsideThreshold, setIsOutsideThreshold] = useState(false)
  const dragStartPos = useRef({ x: item.x, y: item.y })

  const handleDragStart = useCallback(() => {
    dragStartPos.current = { x: item.x, y: item.y }
    setIsDragging(true)
    setIsOutsideThreshold(false)
    if (!isMobileDevice) {
      onSelect(item.id, false)
    }

    const allItems = useCanvasStore.getState().items
    const startPositions: Record<string, { x: number; y: number }> = {}
    selectedItemIds.forEach(id => {
      const selectedItem = allItems.find(i => i.id === id)
      if (selectedItem) {
        startPositions[id] = { x: selectedItem.x ?? 0, y: selectedItem.y ?? 0 }
      }
    })
    selectedItemsStartPos.current = startPositions
  }, [item.id, item.x, item.y, onSelect, isMobileDevice, selectedItemIds])

  const handleDragMove = useCallback((e: any) => {
    const node = e.target
    const dragX = node.x() / PIXELS_PER_METER
    const dragY = node.y() / PIXELS_PER_METER

    const clamped = clampItemPosition(
      dragX,
      dragY,
      item.width,
      item.height,
      item.rotation || 0,
      storeWidth,
      storeHeight
    )

    const dx = dragX - dragStartPos.current.x
    const dy = dragY - dragStartPos.current.y
    const dist = Math.sqrt((dragX - clamped.x) * (dragX - clamped.x) + (dragY - clamped.y) * (dragY - clamped.y))

    setIsOutsideThreshold(dist > 0.3)

    const stage = node.getStage()
    if (stage) {
      selectedItemIds.forEach(id => {
        if (id === item.id) return
        const start = selectedItemsStartPos.current[id]
        if (start) {
          const otherNode = stage.findOne('.item-group-' + id)
          if (otherNode) {
            otherNode.position({
              x: (start.x + dx) * PIXELS_PER_METER,
              y: (start.y + dy) * PIXELS_PER_METER
            })
          }
        }
      })
      stage.getLayer()?.batchDraw()
    }
  }, [item.id, item.width, item.height, item.rotation, storeWidth, storeHeight, selectedItemIds])

  const handleDragEnd = useCallback((e: any) => {
    setIsDragging(false)
    setIsOutsideThreshold(false)
    const node = e.target
    const dragX = node.x() / PIXELS_PER_METER
    const dragY = node.y() / PIXELS_PER_METER

    const stage = node.getStage()
    const container = stage?.container()
    const rect = container?.getBoundingClientRect()
    const pointerPos = stage?.getPointerPosition()

    let isOutsideViewport = false
    if (pointerPos && rect) {
      if (pointerPos.x < 0 || pointerPos.y < 0 || pointerPos.x > rect.width || pointerPos.y > rect.height) {
        isOutsideViewport = true
      }
    }

    const dx = dragX - dragStartPos.current.x
    const dy = dragY - dragStartPos.current.y

    if (isOutsideViewport) {
      selectedItemIds.forEach(id => {
        deleteItem(id)
      })
      if (stage) stage.container().style.cursor = 'default'
      return
    }

    const updates: { id: string; x: number; y: number }[] = []
    selectedItemIds.forEach(id => {
      const start = selectedItemsStartPos.current[id]
      if (start) {
        updates.push({
          id,
          x: start.x + dx,
          y: start.y + dy
        })
      }
    })

    const updateItemsPositions = useCanvasStore.getState().updateItemsPositions
    const success = updateItemsPositions(updates)

    if (!success) {
      if (stage) {
        selectedItemIds.forEach(id => {
          const start = selectedItemsStartPos.current[id]
          if (start) {
            const otherNode = stage.findOne('.item-group-' + id)
            if (otherNode) {
              otherNode.position({
                x: start.x * PIXELS_PER_METER,
                y: start.y * PIXELS_PER_METER
              })
            }
          }
        })
        stage.getLayer()?.batchDraw()
      }
    }
  }, [item.id, selectedItemIds, deleteItem])

  // Allow dragging outside the boundaries during the drag itself, but snap to grid
  const dragBoundFunc = useCallback((pos: { x: number; y: number }) => {
    const node = groupRef.current
    if (!node) return pos

    const stage = node.getStage()
    if (!stage) return pos

    const sScale = stage.scaleX()
    const sX = stage.x()
    const sY = stage.y()

    let targetX = (pos.x - sX) / sScale / PIXELS_PER_METER
    let targetY = (pos.y - sY) / sScale / PIXELS_PER_METER
    
    if (snapToGrid) {
      targetX = Math.round(targetX / gridSize) * gridSize
      targetY = Math.round(targetY / gridSize) * gridSize
    }

    const clamped = clampItemPosition(
      targetX,
      targetY,
      item.width,
      item.height,
      item.rotation || 0,
      storeWidth,
      storeHeight
    )

    const dx = targetX - clamped.x
    const dy = targetY - clamped.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    const RESISTANCE_THRESHOLD = 1.0 // 1.0 meter threshold of resistance

    let finalX = clamped.x
    let finalY = clamped.y

    if (dist > RESISTANCE_THRESHOLD) {
      // Break free from resistance
      finalX = targetX
      finalY = targetY
    }

    return {
      x: finalX * PIXELS_PER_METER * sScale + sX,
      y: finalY * PIXELS_PER_METER * sScale + sY,
    }
  }, [snapToGrid, gridSize, item.width, item.height, item.rotation, storeWidth, storeHeight])


  // 1. PILLAR
  if (isPillar) {
    return (
      <Group
        ref={groupRef}
        name={`item-group-${item.id}`}
        x={x} y={y}
        draggable={isDraggable}
        onClick={handleSelect}
        onTap={handleSelect}
        onDblClick={handleDblClick}
        onDblTap={handleDblClick}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        dragBoundFunc={dragBoundFunc}
        rotation={item.rotation || 0}
        opacity={isOutsideThreshold ? 0.35 : 1}
      >
        <Group ref={drawingsGroupRef}>
          <Rect
            width={w} height={h}
            fill="#1e293b"
            stroke={isSelected ? '#C5A028' : '#334155'}
            strokeWidth={isSelected ? 2 : 1.2}
            cornerRadius={1.5}
            shadowEnabled={!isDragging}
            shadowBlur={isSelected ? 10 : 2}
            shadowColor={isSelected ? '#C5A028' : 'rgba(0,0,0,0.15)'}
          />
          <Line points={[0, 0, w, h]} stroke="#475569" strokeWidth={1} opacity={0.4} />
          <Line points={[w, 0, 0, h]} stroke="#475569" strokeWidth={1} opacity={0.4} />
        </Group>
        {isSelected && (
          <>
            <Text
              x={w + 6} y={12}
              text={`${item.width}m × ${item.height}m`}
              fontSize={9}
              fill="#C5A028"
              fontStyle="600"
            />
            <Group
              x={w + 4}
              y={-4}
              onClick={(e) => {
                e.cancelBubble = true
                deleteItem(item.id)
              }}
              onTap={(e) => {
                e.cancelBubble = true
                deleteItem(item.id)
              }}
              onMouseEnter={(e) => {
                const stage = e.target.getStage()
                if (stage) stage.container().style.cursor = 'pointer'
              }}
              onMouseLeave={(e) => {
                const stage = e.target.getStage()
                if (stage) stage.container().style.cursor = 'default'
              }}
            >
              <Circle radius={7} fill="#EF4444" stroke="white" strokeWidth={1} shadowBlur={2} shadowColor="rgba(0,0,0,0.3)" />
              <Line points={[-3, -3, 3, 3]} stroke="white" strokeWidth={1.2} lineCap="round" />
              <Line points={[-3, 3, 3, -3]} stroke="white" strokeWidth={1.2} lineCap="round" />
            </Group>
          </>
        )}
      </Group>
    )
  }

  // 2. DOOR (Sliding Door Style)
  if (isDoor) {
    const isEntranceDoor = item.name?.toLowerCase().includes('entrada') || item.id?.includes('entrada')
    const strokeColor = item.isEmergency ? '#EF4444' : '#0B3D2E'

    return (
      <Group
        ref={groupRef}
        name={`item-group-${item.id}`}
        x={x} y={y}
        draggable={isDraggable}
        onClick={handleSelect}
        onTap={handleSelect}
        onDblClick={handleDblClick}
        onDblTap={handleDblClick}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        dragBoundFunc={dragBoundFunc}
        rotation={item.rotation || 0}
        opacity={isOutsideThreshold ? 0.35 : 1}
      >
        <Group ref={drawingsGroupRef}>
          {/* Door opening line */}
          <Line points={[0, 0, w, 0]} stroke="#CBD5E1" strokeWidth={1} dash={[3, 3]} opacity={0.5} />
          
          {/* Sliding panels */}
          <Line points={[0, -2, w / 2, -2]} stroke={strokeColor} strokeWidth={3} lineCap="round" />
          <Line points={[w / 2, 2, w, 2]} stroke={strokeColor} strokeWidth={3} lineCap="round" />
          
          {/* Door stops */}
          <Line points={[0, -4, 0, 4]} stroke={strokeColor} strokeWidth={1.5} />
          <Line points={[w, -4, w, 4]} stroke={strokeColor} strokeWidth={1.5} />
          
          {/* Direction indicators */}
          <Line points={[w / 4 - 3, -4.5, w / 4, -2, w / 4 - 3, 0.5]} stroke={strokeColor} strokeWidth={0.8} opacity={0.7} />
          <Line points={[3 * w / 4 + 3, 4.5, 3 * w / 4, 2, 3 * w / 4 + 3, -0.5]} stroke={strokeColor} strokeWidth={0.8} opacity={0.7} />

          {/* CAD Entrance Arrow if it is the entrance door */}
          {isEntranceDoor ? (
            (() => {
              const rot = (item.rotation || 0) % 360
              const isRotatedVertically = rot === 90 || rot === 270
              
              const arrowLinePoints = isRotatedVertically
                ? [w / 2, -12, w / 2, 12]
                : [w / 2, 12, w / 2, -12]

              const arrowHeadPoints = isRotatedVertically
                ? [w / 2 - 4, 8, w / 2, 12, w / 2 + 4, 8]
                : [w / 2 - 4, -8, w / 2, -12, w / 2 + 4, -8]

              const labelY = isRotatedVertically ? -22 : 16

              return (
                <>
                  {/* Arrow pointing up (into the store) */}
                  <Line points={arrowLinePoints} stroke="#0B3D2E" strokeWidth={2.5} lineCap="round" opacity={0.85} />
                  <Line points={arrowHeadPoints} stroke="#0B3D2E" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
                  {/* Green label badge */}
                  <Text
                    x={w / 2 - 30}
                    y={labelY}
                    width={60}
                    text="ENTRADA"
                    fontSize={8}
                    fontStyle="bold"
                    fill="#0B3D2E"
                    align="center"
                  />
                </>
              )
            })()
          ) : (
            <Text
              x={w * 0.1}
              y={-14}
              width={w * 0.8}
              text={item.isEmergency ? `⚠️ EMERGÊNCIA` : getDisplayLabel()}
              fontSize={8}
              fontStyle="bold"
              fill={strokeColor}
              align="center"
            />
          )}
        </Group>
        {isSelected && (
          <Text
            x={w + 6} y={2}
            text={`${item.width}m`}
            fontSize={9}
            fill="#C5A028"
            fontStyle="bold"
          />
        )}
      </Group>
    )
  }

  // 2.5. CHECKOUT L (L-shaped checkout)
  const isCheckoutL = item.itemId?.includes('catalog-131') || item.name?.toLowerCase().includes('checkout em l') || item.name?.toLowerCase().includes('checkout l')
  if (isCheckoutL) {
    const strokeBorderColor = isSelected ? '#C5A028' : (item.strokeColor || '#2563EB')
    const strokeBorderWidth = isSelected ? 2 : 1.2
    const fill = item.fillColor || '#DBEAFE' // Restore distinctive light blue color
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

    const labelTextL = getDisplayLabel()
    const charCountL = labelTextL.length
    const badgeHL = 13
    const badgeWL = Math.max(30, charCountL * 5.5 + 8)
    const badgeXL = (w - badgeWL) / 2
    const badgeYL = -16

    const beltX1 = t + 5
    const beltX2 = w - 5
    const beltY1 = 3
    const beltY2 = t - 3

    return (
      <Group
        ref={groupRef}
        name={`item-group-${item.id}`}
        x={x} y={y}
        draggable={isDraggable}
        onClick={handleSelect}
        onTap={handleSelect}
        onDblClick={handleDblClick}
        onDblTap={handleDblClick}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        dragBoundFunc={dragBoundFunc}
        rotation={item.rotation || 0}
        opacity={isOutsideThreshold ? 0.35 : 1}
      >
        <Group ref={drawingsGroupRef}>
          <Line
            points={points}
            closed={true}
            fill={fill}
            stroke={strokeBorderColor}
            strokeWidth={strokeBorderWidth}
            shadowEnabled={!isDragging}
            shadowBlur={isSelected ? 12 : 2}
            shadowColor={isSelected ? '#C5A028' : 'rgba(15, 23, 42, 0.05)'}
            shadowOffsetY={isSelected ? 2 : 1}
          />

          {/* Conveyor belt on horizontal arm */}
          {w > t + 12 && (
            <>
              <Rect
                x={beltX1}
                y={beltY1}
                width={beltX2 - beltX1}
                height={beltY2 - beltY1}
                fill="#cbd5e1"
                stroke="#64748b"
                strokeWidth={0.6}
                cornerRadius={1}
              />
              {/* Belt rollers */}
              {Array.from({ length: Math.floor((beltX2 - beltX1) / 8) }).map((_, idx) => {
                const rx = beltX1 + 4 + idx * 8
                return <Line key={idx} points={[rx, beltY1 + 1, rx, beltY2 - 1]} stroke="#475569" strokeWidth={0.7} opacity={0.6} />
              })}
              {/* Scanner red window */}
              <Rect
                x={t + 1}
                y={Math.max(2, (t - 6) / 2)}
                width={3.5}
                height={5}
                fill="#ef4444"
                stroke="#b91c1c"
                strokeWidth={0.5}
              />
            </>
          )}

          {/* Keyboard & register setup in corner */}
          {t >= 14 && (
            <>
              <Rect x={3} y={3} width={5} height={4} fill="#475569" cornerRadius={0.5} />
              <Line points={[2, 8, 8, 8]} stroke="#334155" strokeWidth={1} />
            </>
          )}

          {/* Floating label badge */}
          <Rect
            x={badgeXL}
            y={badgeYL}
            width={badgeWL}
            height={badgeHL}
            fill="#0B3D2E"
            stroke={isSelected ? '#C5A028' : (item.strokeColor || '#2563EB')}
            strokeWidth={1}
            cornerRadius={6.5}
            shadowBlur={3}
            shadowColor="rgba(0,0,0,0.4)"
          />
          <Text
            x={badgeXL}
            y={badgeYL + 0.5}
            width={badgeWL}
            height={badgeHL}
            text={labelTextL}
            fontSize={7.5}
            fontStyle="bold"
            fill="#ffffff"
            align="center"
            verticalAlign="middle"
            ellipsis={true}
            wrap="none"
          />
        </Group>

        {/* Selected overlay */}
        {isSelected && (
          <Text
            x={w / 2 - 25}
            y={h + 6}
            width={50}
            text={`${item.width}m × ${item.height}m`}
            fontSize={8.5}
            fontStyle="bold"
            fill="#C5A028"
            align="center"
          />
        )}

        {/* Selection handles */}
        {isSelected && (
          <>
            <Circle x={0} y={0} radius={3.5} fill="#C5A028" stroke="white" strokeWidth={1} />
            <Circle x={w} y={0} radius={3.5} fill="#C5A028" stroke="white" strokeWidth={1} />
            <Circle x={w} y={t} radius={3.5} fill="#C5A028" stroke="white" strokeWidth={1} />
            <Circle x={t} y={t} radius={3.5} fill="#C5A028" stroke="white" strokeWidth={1} />
            <Circle x={t} y={h} radius={3.5} fill="#C5A028" stroke="white" strokeWidth={1} />
            <Circle x={0} y={h} radius={3.5} fill="#C5A028" stroke="white" strokeWidth={1} />
            
            {/* Delete Balloon (Red Badge with X) */}
            <Group
              x={w + 4}
              y={-4}
              onClick={(e) => {
                e.cancelBubble = true
                deleteItem(item.id)
              }}
              onTap={(e) => {
                e.cancelBubble = true
                deleteItem(item.id)
              }}
              onMouseEnter={(e) => {
                const stage = e.target.getStage()
                if (stage) stage.container().style.cursor = 'pointer'
              }}
              onMouseLeave={(e) => {
                const stage = e.target.getStage()
                if (stage) stage.container().style.cursor = 'default'
              }}
            >
              <Circle radius={7} fill="#EF4444" stroke="white" strokeWidth={1} shadowBlur={2} shadowColor="rgba(0,0,0,0.3)" />
              <Line points={[-3, -3, 3, 3]} stroke="white" strokeWidth={1.2} lineCap="round" />
              <Line points={[-3, 3, 3, -3]} stroke="white" strokeWidth={1.2} lineCap="round" />
            </Group>
          </>
        )}
      </Group>
    )
  }

  // 3. GENERAL RETAIL ITEMS
  const strokeBorderColor = isSelected ? '#C5A028' : (item.strokeColor || '#475569')
  const strokeBorderWidth = isSelected ? 2 : 1.2
  const cRadius = isRoom ? 5 : (isRound ? Math.min(w, h) / 2 : 3.5)

  // Use the highly visible distinctive colors of the catalog (original colors)
  const dynamicFill = item.fillColor || '#E2E8F0'
  const dynamicStroke = isSelected ? '#C5A028' : (item.strokeColor || '#475569')

  const labelText = getDisplayLabel()
  const charCount = labelText.length
  const badgeH = 13
  const badgeW = Math.max(30, charCount * 5.5 + 8)
  const badgeX = (w - badgeW) / 2
  const badgeY = -16
  const showBadge = w >= 25 && h >= 12 && !isObstacle

  return (
    <Group
      ref={groupRef}
      name={`item-group-${item.id}`}
      x={x} y={y}
      draggable={isDraggable}
      onClick={handleSelect}
      onTap={handleSelect}
      onDblClick={handleDblClick}
      onDblTap={handleDblClick}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      dragBoundFunc={dragBoundFunc}
      rotation={item.rotation || 0}
      opacity={isOutsideThreshold ? 0.35 : 1}
    >
      <Group ref={drawingsGroupRef}>
        {imgObj ? (
          <>
            <Rect
              width={w} height={h}
              fill="#ffffff"
              stroke={dynamicStroke}
              strokeWidth={strokeBorderWidth}
              cornerRadius={cRadius}
              shadowEnabled={!isDragging}
              shadowBlur={isSelected ? 12 : 2}
              shadowColor={isSelected ? '#C5A028' : 'rgba(15, 23, 42, 0.05)'}
              shadowOffsetY={isSelected ? 2 : 1}
            />
            <KonvaImage
              image={imgObj}
              x={1.5}
              y={1.5}
              width={w - 3}
              height={h - 3}
              cornerRadius={cRadius > 1.5 ? cRadius - 1.5 : cRadius}
            />
          </>
        ) : (
          <>
            <Rect
              width={w} height={h}
              fill={isObstacle ? '#f8fafc' : dynamicFill}
              stroke={isObstacle ? '#334155' : dynamicStroke}
              strokeWidth={isObstacle ? 5 : strokeBorderWidth}
              cornerRadius={cRadius}
              shadowEnabled={!isDragging}
              shadowBlur={isSelected ? 12 : 2}
              shadowColor={isSelected ? '#C5A028' : 'rgba(15, 23, 42, 0.05)'}
              shadowOffsetY={isSelected ? 2 : 1}
            />

            {/* A. GONDOLAS: CAD side caps, shelf lines & products */}
            {!isSmall && item.category === 'GONDOLAS' && (
              w >= h ? (
                <>
                  {/* End caps */}
                  <Rect x={0} y={0} width={2.5} height={h} fill={item.strokeColor || '#5C4A2A'} opacity={0.65} />
                  <Rect x={w - 2.5} y={0} width={2.5} height={h} fill={item.strokeColor || '#5C4A2A'} opacity={0.65} />
                  {/* Divider */}
                  <Line points={[2.5, h / 2, w - 2.5, h / 2]} stroke={item.strokeColor || '#5C4A2A'} strokeWidth={1} opacity={0.8} />
                  {/* Shelf lines */}
                  <Line points={[2.5, h * 0.25, w - 2.5, h * 0.25]} stroke={item.strokeColor || '#5C4A2A'} strokeWidth={0.8} opacity={0.45} />
                  <Line points={[2.5, h * 0.75, w - 2.5, h * 0.75]} stroke={item.strokeColor || '#5C4A2A'} strokeWidth={0.8} opacity={0.45} />
                  
                  {/* Products on shelves */}
                  {w >= 30 && Array.from({ length: Math.floor((w - 8) / 10) }).map((_, idx) => {
                    const px = 6 + idx * 10
                    const prodColors = ['#f59e0b', '#3b82f6', '#ef4444', '#10b981']
                    return (
                      <Group key={idx}>
                        <Rect x={px} y={h * 0.25 - 1.5} width={4} height={3} fill={prodColors[idx % 4]} opacity={0.7} cornerRadius={0.5} />
                        <Rect x={px + 5} y={h * 0.75 - 1.5} width={4} height={3} fill={prodColors[(idx + 1) % 4]} opacity={0.7} cornerRadius={0.5} />
                      </Group>
                    )
                  })}
                </>
              ) : (
                <>
                  {/* End caps */}
                  <Rect x={0} y={0} width={w} height={2.5} fill={item.strokeColor || '#5C4A2A'} opacity={0.65} />
                  <Rect x={0} y={h - 2.5} width={w} height={2.5} fill={item.strokeColor || '#5C4A2A'} opacity={0.65} />
                  {/* Divider */}
                  <Line points={[w / 2, 2.5, w / 2, h - 2.5]} stroke={item.strokeColor || '#5C4A2A'} strokeWidth={1} opacity={0.8} />
                  {/* Shelf lines */}
                  <Line points={[w * 0.25, 2.5, w * 0.25, h - 2.5]} stroke={item.strokeColor || '#5C4A2A'} strokeWidth={0.8} opacity={0.45} />
                  <Line points={[w * 0.75, 2.5, w * 0.75, h - 2.5]} stroke={item.strokeColor || '#5C4A2A'} strokeWidth={0.8} opacity={0.45} />
                  
                  {/* Products on shelves vertical */}
                  {h >= 30 && Array.from({ length: Math.floor((h - 8) / 10) }).map((_, idx) => {
                    const py = 6 + idx * 10
                    const prodColors = ['#f59e0b', '#3b82f6', '#ef4444', '#10b981']
                    return (
                      <Group key={idx}>
                        <Rect x={w * 0.25 - 1.5} y={py} width={3} height={4} fill={prodColors[idx % 4]} opacity={0.7} cornerRadius={0.5} />
                        <Rect x={w * 0.75 - 1.5} y={py + 5} width={3} height={4} fill={prodColors[(idx + 1) % 4]} opacity={0.7} cornerRadius={0.5} />
                      </Group>
                    )
                  })}
                </>
              )
            )}

            {/* B. BALCOES: Countertop inset & register shapes */}
            {!isSmall && item.category === 'BALCOES' && (
              <>
                <Rect
                  x={3} y={3}
                  width={w - 6} height={h - 6}
                  fill="#f8fafc" // Distinct countertop inset
                  stroke={item.strokeColor || '#1D4ED8'}
                  strokeWidth={0.8}
                  cornerRadius={1.5}
                />
                {/* Mock keyboard & monitor screen & scanner */}
                {w >= 24 && h >= 16 && (
                  <>
                    {/* Keyboard */}
                    <Rect x={w / 2 - 5} y={h / 2 - 1.5} width={10} height={3} fill="#64748b" cornerRadius={0.5} opacity={0.8} />
                    {/* Monitor */}
                    <Line points={[w / 2 - 6, h / 2 - 4, w / 2 + 6, h / 2 - 4]} stroke="#334155" strokeWidth={1.2} />
                    <Line points={[w / 2, h / 2 - 4, w / 2, h / 2 - 2]} stroke="#475569" strokeWidth={1} />
                    {/* Scanner bed */}
                    <Rect x={w / 2 - 9} y={h / 2 - 1.5} width={2.5} height={2.5} fill="#ef4444" stroke="#dc2626" strokeWidth={0.4} />
                  </>
                )}
              </>
            )}

            {/* C. REFRIGERACAO: Double frame, diagonal glass reflection & racks */}
            {!isSmall && item.category === 'REFRIGERACAO' && (
              <>
                {/* Inner wall insulation */}
                <Rect x={3} y={3} width={w - 6} height={h - 6} stroke={item.strokeColor || '#0EA5E9'} strokeWidth={0.8} opacity={0.7} />
                {/* Diagonal glass reflection */}
                <Line points={[w * 0.15, h * 0.25, w * 0.35, h * 0.45]} stroke="#ffffff" strokeWidth={1.2} opacity={0.6} />
                <Line points={[w * 0.25, h * 0.25, w * 0.45, h * 0.45]} stroke="#ffffff" strokeWidth={0.8} opacity={0.4} />
                {/* Wire racks */}
                {w >= h ? (
                  Array.from({ length: Math.floor((w - 8) / 8) }).map((_, idx) => {
                    const gx = 6 + idx * 8
                    return <Line key={idx} points={[gx, 4, gx, h - 4]} stroke={item.strokeColor || '#0EA5E9'} strokeWidth={0.4} opacity={0.4} />
                  })
                ) : (
                  Array.from({ length: Math.floor((h - 8) / 8) }).map((_, idx) => {
                    const gy = 6 + idx * 8
                    return <Line key={idx} points={[4, gy, w - 4, gy]} stroke={item.strokeColor || '#0EA5E9'} strokeWidth={0.4} opacity={0.4} />
                  })
                )}
                {/* Fan vent circle */}
                {w >= 20 && h >= 20 && (
                  <Circle x={w - 6} y={h - 6} radius={2.5} stroke={item.strokeColor || '#0EA5E9'} strokeWidth={0.5} opacity={0.6} />
                )}
              </>
            )}

            {/* D. PERFUMARIA: Circular details & cosmetics display */}
            {!isSmall && item.category === 'PERFUMARIA' && (
              isRound ? (
                <>
                  <Circle x={w / 2} y={h / 2} radius={Math.min(w, h) / 2 - 3} stroke={item.strokeColor || '#9D174D'} strokeWidth={0.8} opacity={0.8} />
                  <Circle x={w / 2} y={h / 2} radius={Math.min(w, h) / 4} stroke={item.strokeColor || '#9D174D'} strokeWidth={0.5} opacity={0.6} />
                  {/* Radials */}
                  <Line points={[3, h / 2, w - 3, h / 2]} stroke={item.strokeColor || '#9D174D'} strokeWidth={0.5} opacity={0.4} />
                  <Line points={[w / 2, 3, w / 2, h - 3]} stroke={item.strokeColor || '#9D174D'} strokeWidth={0.5} opacity={0.4} />
                  
                  {/* Cosmetics circles */}
                  <Circle x={w / 2 - 3.5} y={h / 2 - 3.5} radius={1.5} fill="#db2777" />
                  <Circle x={w / 2 + 3.5} y={h / 2 - 3.5} radius={1.5} fill="#f59e0b" />
                  <Circle x={w / 2 - 3.5} y={h / 2 + 3.5} radius={1.5} fill="#0ea5e9" />
                  <Circle x={w / 2 + 3.5} y={h / 2 + 3.5} radius={1.5} fill="#10b981" />
                </>
              ) : (
                <>
                  <Rect x={2.5} y={2.5} width={w - 5} height={h - 5} stroke={item.strokeColor || '#9D174D'} strokeWidth={0.7} dash={[2, 2]} opacity={0.6} />
                  {/* Perfume bottles on shelf */}
                  {w >= 30 && (
                    <Group>
                      <Line points={[4, h * 0.4, w - 4, h * 0.4]} stroke={item.strokeColor || '#9D174D'} strokeWidth={0.5} opacity={0.4} />
                      <Line points={[4, h * 0.7, w - 4, h * 0.7]} stroke={item.strokeColor || '#9D174D'} strokeWidth={0.5} opacity={0.4} />
                      
                      {Array.from({ length: Math.floor((w - 8) / 12) }).map((_, idx) => {
                        const px = 6 + idx * 12
                        return (
                          <Group key={idx}>
                            {/* Perfume 1: round bottle with cap */}
                            <Circle x={px} y={h * 0.4 - 1.5} radius={1.5} fill="#db2777" />
                            <Rect x={px - 0.5} y={h * 0.4 - 3.5} width={1} height={1.5} fill="#374151" />
                            
                            {/* Perfume 2: square bottle */}
                            <Rect x={px + 5} y={h * 0.7 - 2.5} width={3} height={3} fill="#f59e0b" cornerRadius={0.5} />
                            <Rect x={px + 6} y={h * 0.7 - 4} width={1} height={1.5} fill="#374151" />
                          </Group>
                        )
                      })}
                    </Group>
                  )}
                </>
              )
            )}
          </>
        )}

        {/* E. ROOMS / SERVICOS: Desk, chairs, and medical cross */}
        {!isSmall && item.category === 'SERVICOS' && (
          <>
            <Rect x={3} y={3} width={w - 6} height={h - 6} stroke={item.strokeColor || '#15803D'} strokeWidth={0.6} dash={[3, 1]} opacity={0.6} />
            {/* Medical cross */}
            {w >= 20 && h >= 20 && (
              <Group>
                <Line points={[w / 2, h / 2 - 5, w / 2, h / 2 + 5]} stroke="#10b981" strokeWidth={2} lineCap="round" />
                <Line points={[w / 2 - 5, h / 2, w / 2 + 5, h / 2]} stroke="#10b981" strokeWidth={2} lineCap="round" />
              </Group>
            )}
            {/* Desk and chairs */}
            {w >= 35 && h >= 25 && (
              <>
                {/* Desk */}
                <Rect x={4} y={4} width={12} height={8} fill="#e2e8f0" stroke="#475569" strokeWidth={0.5} cornerRadius={1} />
                {/* Chair */}
                <Circle x={10} y={15} radius={2} fill="#64748b" />
              </>
            )}
          </>
        )}

        {/* ROOMS / OPERACIONAL general double wall boundary */}
        {!isSmall && isRoom && item.category !== 'SERVICOS' && (
          <Rect x={4} y={4} width={w - 8} height={h - 8} stroke={item.strokeColor || '#475569'} strokeWidth={0.8} dash={[4, 2]} opacity={0.65} />
        )}

        {/* F. OPERACIONAL: Storage cross bracing (X) */}
        {!isSmall && item.category === 'OPERACIONAL' && (
          <>
            <Line points={[3, 3, w - 3, h - 3]} stroke={item.strokeColor || '#92400E'} strokeWidth={0.6} opacity={0.45} />
            <Line points={[w - 3, 3, 3, h - 3]} stroke={item.strokeColor || '#92400E'} strokeWidth={0.6} opacity={0.45} />
          </>
        )}

        {/* G. ACESSIBILIDADE: Ramp arrows and chevrons */}
        {!isSmall && item.category === 'ACESSIBILIDADE' && (
          <>
            {w >= h ? (
              <>
                <Line points={[w * 0.3, h * 0.3, w * 0.5, h * 0.5, w * 0.3, h * 0.7]} stroke={item.strokeColor || '#F59E0B'} strokeWidth={1.2} strokeLinecap="round" />
                <Line points={[w * 0.6, h * 0.3, w * 0.8, h * 0.5, w * 0.6, h * 0.7]} stroke={item.strokeColor || '#F59E0B'} strokeWidth={1.2} strokeLinecap="round" />
              </>
            ) : (
              <>
                <Line points={[w * 0.3, h * 0.3, w * 0.5, h * 0.5, w * 0.7, h * 0.3]} stroke={item.strokeColor || '#F59E0B'} strokeWidth={1.2} strokeLinecap="round" />
                <Line points={[w * 0.3, h * 0.6, w * 0.5, h * 0.8, w * 0.7, h * 0.6]} stroke={item.strokeColor || '#F59E0B'} strokeWidth={1.2} strokeLinecap="round" />
              </>
            )}
          </>
        )}

        {/* H. OBSTACULO / SALAS E DIVISORIAS: Borda dupla e Nome Central */}
        {!isSmall && isObstacle && (
          <>
            <Rect
              x={5} y={5}
              width={w - 10} height={h - 10}
              stroke="#94a3b8"
              strokeWidth={0.8}
              opacity={0.7}
              listening={false}
            />
            <Text
              x={6}
              y={h / 2 - 5}
              width={w - 12}
              text={labelText.toUpperCase()}
              fontSize={9}
              fontStyle="bold"
              fill="#1e293b"
              align="center"
              opacity={0.9}
              listening={false}
            />
          </>
        )}

        {/* Floating Label Capsule Badge */}
        {showBadge ? (
          <Group>
            <Rect
              x={badgeX}
              y={badgeY}
              width={badgeW}
              height={badgeH}
              fill="#0B3D2E" // dark green background
              stroke={isSelected ? '#C5A028' : (item.strokeColor || '#475569')}
              strokeWidth={1}
              cornerRadius={6.5}
              shadowBlur={4}
              shadowColor="rgba(0,0,0,0.4)"
            />
            <Text
              x={badgeX}
              y={badgeY + 0.5}
              width={badgeW}
              height={badgeH}
              text={labelText}
              fontSize={7.5}
              fontStyle="bold"
              fill="#ffffff"
              align="center"
              verticalAlign="middle"
              ellipsis={true}
              wrap="none"
            />
          </Group>
        ) : (
          /* Floating text fallback for tiny items */
          <Text
            x={-10}
            y={-10}
            width={w + 20}
            text={labelText}
            fontSize={6}
            fontStyle="bold"
            fill={item.strokeColor || '#E2E8F0'}
            align="center"
            verticalAlign="middle"
            ellipsis={true}
            wrap="none"
          />
        )}
      </Group>

      {/* Dimension overlay when selected */}
      {isSelected && (
        <Text
          x={w / 2 - 30}
          y={h + 6}
          width={60}
          text={`${item.width}m × ${item.height}m`}
          fontSize={8.5}
          fontStyle="bold"
          fill="#C5A028"
          align="center"
        />
      )}

      {/* Corner selection handles */}
      {isSelected && (
        <>
          <Circle x={0} y={0} radius={3.5} fill="#C5A028" stroke="white" strokeWidth={1} />
          <Circle x={w} y={0} radius={3.5} fill="#C5A028" stroke="white" strokeWidth={1} />
          <Circle x={0} y={h} radius={3.5} fill="#C5A028" stroke="white" strokeWidth={1} />
          <Circle x={w} y={h} radius={3.5} fill="#C5A028" stroke="white" strokeWidth={1} />
          
          {/* Delete Balloon (Red Badge with X) */}
          <Group
            x={w + 4}
            y={-4}
            onClick={(e) => {
              e.cancelBubble = true
              deleteItem(item.id)
            }}
            onTap={(e) => {
              e.cancelBubble = true
              deleteItem(item.id)
            }}
            onMouseEnter={(e) => {
              const stage = e.target.getStage()
              if (stage) stage.container().style.cursor = 'pointer'
            }}
            onMouseLeave={(e) => {
              const stage = e.target.getStage()
              if (stage) stage.container().style.cursor = 'default'
            }}
          >
            <Circle radius={7} fill="#EF4444" stroke="white" strokeWidth={1} shadowBlur={2} shadowColor="rgba(0,0,0,0.3)" />
            <Line points={[-3, -3, 3, 3]} stroke="white" strokeWidth={1.2} lineCap="round" />
            <Line points={[-3, 3, 3, -3]} stroke="white" strokeWidth={1.2} lineCap="round" />
          </Group>
        </>
      )}
    </Group>
  )
})

export default CanvasItem

