import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  clampFloatingPosition,
  dockFloatingPosition,
  getFloatingPanelStyle,
  getNearestFloatingEdge,
} from '../utils/floatingPosition'

const viewport = { width: 1000, height: 800 }

test('released buttons dock to the nearest of all four edges', () => {
  for (const [position, edge, expected] of [
    [{ x: 60, y: 300 }, 'left', { x: 8, y: 300 }],
    [{ x: 850, y: 300 }, 'right', { x: 948, y: 300 }],
    [{ x: 400, y: 60 }, 'top', { x: 400, y: 8 }],
    [{ x: 400, y: 650 }, 'bottom', { x: 400, y: 748 }],
  ] as const) {
    assert.equal(getNearestFloatingEdge(position, viewport), edge)
    assert.deepEqual(dockFloatingPosition(position, viewport, edge), expected)
  }
})

test('corner ties consistently prefer a side edge', () => {
  assert.equal(getNearestFloatingEdge({ x: 8, y: 8 }, viewport), 'left')
  assert.equal(getNearestFloatingEdge({ x: 948, y: 748 }, viewport), 'right')
})

test('dragging beyond the viewport keeps the entire button visible', () => {
  assert.deepEqual(clampFloatingPosition({ x: -200, y: 1200 }, viewport), {
    x: 8,
    y: 748,
  })
  assert.deepEqual(clampFloatingPosition({ x: 1200, y: -200 }, viewport), {
    x: 948,
    y: 8,
  })
})

test('resizing retains the docked edge and clamps the other coordinate', () => {
  const narrow = { width: 320, height: 240 }
  assert.deepEqual(dockFloatingPosition({ x: 948, y: 500 }, narrow, 'right'), {
    x: 268,
    y: 188,
  })
  assert.deepEqual(
    dockFloatingPosition({ x: 268, y: 100 }, viewport, 'right'),
    { x: 948, y: 100 },
  )
  assert.deepEqual(dockFloatingPosition({ x: 900, y: 748 }, narrow, 'bottom'), {
    x: 268,
    y: 188,
  })
})

test('tiny viewports do not produce negative button coordinates', () => {
  assert.deepEqual(
    clampFloatingPosition({ x: 500, y: -500 }, { width: 40, height: 30 }),
    { x: 0, y: 0 },
  )
})

test('panels open below top-docked buttons and above bottom-docked buttons', () => {
  assert.deepEqual(getFloatingPanelStyle({ x: 400, y: 8 }, viewport), {
    left: '242px',
    width: '360px',
    maxHeight: '640px',
    top: '64px',
  })
  assert.deepEqual(getFloatingPanelStyle({ x: 400, y: 748 }, viewport), {
    left: '242px',
    width: '360px',
    maxHeight: '640px',
    bottom: '64px',
  })
})

test('panels stay on-screen at either side in narrow windows', () => {
  const narrow = { width: 320, height: 480 }
  for (const x of [8, 268]) {
    assert.deepEqual(getFloatingPanelStyle({ x, y: 200 }, narrow), {
      left: '8px',
      width: '304px',
      maxHeight: '216px',
      top: '256px',
    })
  }
})
