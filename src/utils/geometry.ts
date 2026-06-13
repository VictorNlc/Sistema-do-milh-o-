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

  const realW = rot === 90 || rot === 270 ? h : w
  const realH = rot === 90 || rot === 270 ? w : h

  let x1 = x
  if (rot === 90 || rot === 180) {
    x1 = x - realW
  }

  let y1 = y
  if (rot === 270 || rot === 180) {
    y1 = y - realH
  }

  return {
    x: x1,
    y: y1,
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
