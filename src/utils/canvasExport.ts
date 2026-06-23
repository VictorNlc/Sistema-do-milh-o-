import type Konva from 'konva'
import { PIXELS_PER_METER } from '../store/canvasStore'

/**
 * Captures the entire canvas layout (original size, complete floor plan, walls, and dimensions)
 * with a consistent margin, returning a high-resolution base64 PNG data URL.
 */
export function getFullLayoutDataUrl(
  stage: Konva.Stage,
  storeWidth: number,
  storeHeight: number,
  options?: { mimeType?: string; quality?: number; pixelRatio?: number }
): string {
  try {
    // 1. Save original view state
    const oldScaleX = stage.scaleX()
    const oldScaleY = stage.scaleY()
    const oldX = stage.x()
    const oldY = stage.y()
    const oldWidth = stage.width()
    const oldHeight = stage.height()

    // 2. Compute pixel size of the layout
    const canvasW = storeWidth * PIXELS_PER_METER
    const canvasH = storeHeight * PIXELS_PER_METER

    // 3. Define margin for walls, dimensions, and ruler marks
    const margin = 60
    const fullW = canvasW + margin * 2
    const fullH = canvasH + margin * 2

    // 4. Update stage size, position, and scale imperatively
    stage.width(fullW)
    stage.height(fullH)
    stage.scale({ x: 1, y: 1 })
    stage.position({ x: margin, y: margin })
    stage.draw()

    // 5. Generate image
    const dataUrl = stage.toDataURL({
      mimeType: options?.mimeType || 'image/png',
      quality: options?.quality ?? 1,
      pixelRatio: options?.pixelRatio ?? 2,
    })

    // 6. Restore original view state
    stage.width(oldWidth)
    stage.height(oldHeight)
    stage.scale({ x: oldScaleX, y: oldScaleY })
    stage.position({ x: oldX, y: oldY })
    stage.draw()

    return dataUrl
  } catch (err) {
    console.error('Error generating full layout data URL:', err)
    return ''
  }
}
