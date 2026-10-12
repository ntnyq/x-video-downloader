import { clamp, isNumber } from '@ntnyq/utils'
import { isRecord } from './video'

export const FLOATING_BUTTON_SIZE = 44
export const FLOATING_EDGE_GAP = 8

export type FloatingEdge = 'left' | 'right' | 'top' | 'bottom'

export interface FloatingPosition {
  x: number
  y: number
}

export interface FloatingPlacement extends FloatingPosition {
  /**
   * Viewport edge selected by the last completed drag.
   */
  edge: FloatingEdge
}

export interface FloatingViewport {
  width: number
  height: number
}

/**
 * Validates persisted launcher coordinates before using them in CSS.
 *
 * @param value - Untrusted extension storage value.
 * @returns A saved placement, or undefined when it is missing or invalid.
 */
export function normalizeFloatingPlacement(
  value: unknown,
): FloatingPlacement | undefined {
  if (!isRecord(value)) {
    return
  }
  const { edge, x, y } = value
  if (
    (edge !== 'left' && edge !== 'right' && edge !== 'top' && edge !== 'bottom')
    || !isNumber(x)
    || !Number.isFinite(x)
    || !isNumber(y)
    || !Number.isFinite(y)
  ) {
    return
  }
  return {
    edge,
    x,
    y,
  }
}

/**
 * Keeps the entire button inside the viewport, including very small windows.
 *
 * @param position - Requested button coordinates.
 * @param viewport - Current viewport dimensions in CSS pixels.
 * @returns Coordinates with an inset from every available edge.
 */
export function clampFloatingPosition(
  position: FloatingPosition,
  viewport: FloatingViewport,
): FloatingPosition {
  const maxX = Math.max(
    0,
    viewport.width - FLOATING_BUTTON_SIZE - FLOATING_EDGE_GAP,
  )
  const maxY = Math.max(
    0,
    viewport.height - FLOATING_BUTTON_SIZE - FLOATING_EDGE_GAP,
  )
  return {
    x: clamp(position.x, Math.min(FLOATING_EDGE_GAP, maxX), maxX),
    y: clamp(position.y, Math.min(FLOATING_EDGE_GAP, maxY), maxY),
  }
}

/**
 * Docks a button on a chosen edge while preserving its position along that edge.
 *
 * @param position - Current button coordinates.
 * @param viewport - Current viewport dimensions.
 * @param edge - Edge to preserve after docking or resizing.
 * @returns Visible coordinates on the requested edge.
 */
export function dockFloatingPosition(
  position: FloatingPosition,
  viewport: FloatingViewport,
  edge: FloatingEdge,
): FloatingPosition {
  return clampFloatingPosition(
    {
      x: edge === 'left' ? 0 : edge === 'right' ? viewport.width : position.x,
      y: edge === 'top' ? 0 : edge === 'bottom' ? viewport.height : position.y,
    },
    viewport,
  )
}

/**
 * Finds the nearest of the four viewport edges, preferring a side on ties.
 *
 * @param position - Released button coordinates.
 * @param viewport - Current viewport dimensions.
 * @returns The edge with the shortest distance to the button.
 */
export function getNearestFloatingEdge(
  position: FloatingPosition,
  viewport: FloatingViewport,
): FloatingEdge {
  const { x, y } = clampFloatingPosition(position, viewport)
  const distances: [FloatingEdge, number][] = [
    ['left', x],
    ['right', viewport.width - x - FLOATING_BUTTON_SIZE],
    ['top', y],
    ['bottom', viewport.height - y - FLOATING_BUTTON_SIZE],
  ]
  return distances.reduce((nearest, candidate) =>
    candidate[1] < nearest[1] ? candidate : nearest,
  )[0]
}

/**
 * Places the panel above or below the button, using the larger available space.
 *
 * @param position - Visible button coordinates.
 * @param viewport - Current viewport dimensions.
 * @returns Fixed-position styles that keep the panel within the viewport.
 */
export function getFloatingPanelStyle(
  position: FloatingPosition,
  viewport: FloatingViewport,
) {
  const gap = 12
  const width = clamp(viewport.width - FLOATING_EDGE_GAP * 2, 0, 360)
  const above = Math.max(0, position.y - gap - FLOATING_EDGE_GAP)
  const below = Math.max(
    0,
    viewport.height
      - position.y
      - FLOATING_BUTTON_SIZE
      - gap
      - FLOATING_EDGE_GAP,
  )
  const left = Math.max(
    FLOATING_EDGE_GAP,
    Math.min(
      position.x + FLOATING_BUTTON_SIZE / 2 - width / 2,
      viewport.width - width - FLOATING_EDGE_GAP,
    ),
  )
  return {
    left: `${left}px`,
    width: `${width}px`,
    maxHeight: `${Math.min(640, Math.max(above, below))}px`,
    ...(above >= below
      ? { bottom: `${viewport.height - position.y + gap}px` }
      : { top: `${position.y + FLOATING_BUTTON_SIZE + gap}px` }),
  }
}
