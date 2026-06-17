export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Calculates the absolute Axis-Aligned Bounding Box (AABB) of an item
 * considering Konva's rotation pivot (which rotates around the top-left corner).
 */
export function getRotatedBounds(
  x: number,
  y: number,
  w: number,
  h: number,
  rotation: number = 0
): BoundingBox {
  const rot = (rotation % 360 + 360) % 360
  const rad = (rot * Math.PI) / 180

  const realW = Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad))
  const realH = Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad))

  const c1_x = w * Math.cos(rad)
  const c1_y = w * Math.sin(rad)
  const c2_x = w * Math.cos(rad) - h * Math.sin(rad)
  const c2_y = w * Math.sin(rad) + h * Math.cos(rad)
  const c3_x = -h * Math.sin(rad)
  const c3_y = h * Math.cos(rad)

  const minX = Math.min(0, c1_x, c2_x, c3_x)
  const minY = Math.min(0, c1_y, c2_y, c3_y)

  return {
    x: x + minX,
    y: y + minY,
    width: realW,
    height: realH
  }
}

/**
 * Checks if two Axis-Aligned Bounding Boxes (AABB) intersect.
 */
export function checkAABBCollision(boxA: BoundingBox, boxB: BoundingBox): boolean {
  return (
    boxA.x < boxB.x + boxB.width &&
    boxA.x + boxA.width > boxB.x &&
    boxA.y < boxB.y + boxB.height &&
    boxA.y + boxA.height > boxB.y
  )
}

/**
 * Clamps the pivot position (x, y) of a rotated item of width w and height h
 * so that its rotated bounding box stays fully within [0, storeWidth] and [0, storeHeight].
 */
export function clampItemPosition(
  x: number,
  y: number,
  w: number,
  h: number,
  rotation: number,
  storeWidth: number,
  storeHeight: number
): { x: number; y: number } {
  const rot = (rotation % 360 + 360) % 360
  const realW = rot === 90 || rot === 270 ? h : w
  const realH = rot === 90 || rot === 270 ? w : h

  let offsetLeft = 0
  if (rot === 90 || rot === 180) {
    offsetLeft = realW
  }

  let offsetTop = 0
  if (rot === 270 || rot === 180) {
    offsetTop = realH
  }

  const boundsX = x - offsetLeft
  const boundsY = y - offsetTop

  const clampedBoundsX = Math.max(0, Math.min(boundsX, storeWidth - realW))
  const clampedBoundsY = Math.max(0, Math.min(boundsY, storeHeight - realH))

  return {
    x: clampedBoundsX + offsetLeft,
    y: clampedBoundsY + offsetTop,
  }
}

