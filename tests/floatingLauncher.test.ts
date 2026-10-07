import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import * as vueuse from '@vueuse/core'
import ts from 'typescript'
import * as vue from 'vue'
import * as floatingPosition from '../utils/floatingPosition'
import type { useFloatingLauncher } from '../composables/useFloatingLauncher'
import type { FloatingPlacement } from '../utils/floatingPosition'

/**
 * Mounts the real composable with DOM geometry and extension storage adapters.
 *
 * @param read - Stored value or deferred read supplied by the test.
 * @param write - Storage write supplied by the test.
 * @returns Launcher handlers, scope, window, and captured persistence calls.
 * @throws When a dependency is unsupported or the scope fails to initialize.
 */
function createLauncher(
  read: () => Promise<unknown> = async () => null,
  write: (value: FloatingPlacement) => Promise<void> = async () => {},
) {
  const window = Object.assign(new EventTarget(), {
    innerWidth: 1000,
    innerHeight: 800,
  })
  const writes: FloatingPlacement[] = []
  const warnings: unknown[][] = []
  const scope = vue.effectScope()
  const exports: { useFloatingLauncher?: typeof useFloatingLauncher } = {}
  runInNewContext(
    ts.transpileModule(
      readFileSync(
        new URL('../composables/useFloatingLauncher.ts', import.meta.url),
        'utf8',
      ),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    {
      exports,
      window,
      console: { warn: (...args: unknown[]) => warnings.push(args) },
      /**
       * Resolves runtime dependencies while replacing only extension storage.
       *
       * @param id - Imported module identifier.
       * @returns Real Vue/position logic or the controlled storage adapter.
       * @throws When an unexpected dependency is imported.
       */
      require(id: string) {
        if (id === 'vue') {
          return vue
        }
        if (id === '@vueuse/core') {
          return vueuse
        }
        if (id === '../utils/floatingPosition') {
          return floatingPosition
        }
        if (id === '../utils/floatingLauncherSetting') {
          return {
            floatingLauncherSetting: {
              getValue: read,
              async setValue(value: FloatingPlacement) {
                writes.push(structuredClone(value))
                await write(value)
              },
            },
          }
        }
        throw new Error(id)
      },
    },
  )
  assert.ok(exports.useFloatingLauncher)
  const factory = exports.useFloatingLauncher
  let getRect = () => ({ left: 948, top: 736 })
  // Only pointer capture and geometry are needed from the button in this harness.
  const button = vue.shallowRef({
    getBoundingClientRect() {
      return getRect()
    },
    setPointerCapture: () => {},
    hasPointerCapture: () => false,
  } as unknown as HTMLButtonElement)
  const state = scope.run(() => factory(button))
  assert.ok(state)
  getRect = () => ({
    left: Number(state.buttonStyle.value.left.slice(0, -2)),
    top: Number(state.buttonStyle.value.top.slice(0, -2)),
  })
  return { state, scope, window, writes, warnings }
}

/**
 * Supplies the pointer fields consumed by the launcher without a browser runtime.
 *
 * @param x - Horizontal pointer position.
 * @param y - Vertical pointer position.
 * @returns A primary pointer event fixture.
 */
function pointer(x: number, y: number): PointerEvent {
  const event: Partial<PointerEvent> = {
    pointerId: 1,
    isPrimary: true,
    button: 0,
    clientX: x,
    clientY: y,
    preventDefault() {},
  }
  return event as PointerEvent
}

/**
 * Flushes asynchronous storage and Vue event subscription work.
 *
 * @returns A promise resolved on the next event-loop turn.
 */
async function flush() {
  await new Promise(resolve => setImmediate(resolve))
}

test('dragged placements survive remounts on all four edges', async () => {
  for (const [x, y, edge] of [
    [8, 300, 'left'],
    [948, 300, 'right'],
    [400, 8, 'top'],
    [400, 748, 'bottom'],
  ] as const) {
    let saved: FloatingPlacement | null = null
    const launcher = createLauncher(
      async () => saved,
      async value => {
        saved = value
      },
    )
    await flush()
    launcher.state.onPointerDown(pointer(948, 736))
    launcher.state.onPointerMove(pointer(x, y))
    assert.equal(launcher.writes.length, 0)
    launcher.state.onPointerUp(pointer(x, y))
    await flush()
    assert.deepEqual(structuredClone(saved), { x, y, edge })
    launcher.scope.stop()

    const reloaded = createLauncher(async () => saved)
    await flush()
    assert.equal(reloaded.state.buttonStyle.value.left, `${x}px`)
    assert.equal(reloaded.state.buttonStyle.value.top, `${y}px`)
    assert.equal(reloaded.writes.length, 0)
    reloaded.scope.stop()
  }
})

test('restoration uses the current viewport and preserves the saved edge after resize', async t => {
  const launcher = createLauncher(async () => ({
    edge: 'bottom',
    x: 900,
    y: 748,
  }))
  t.after(() => launcher.scope.stop())
  launcher.window.innerWidth = 320
  launcher.window.innerHeight = 240
  await vue.nextTick()
  launcher.window.dispatchEvent(new Event('resize'))
  await flush()
  assert.equal(launcher.state.buttonStyle.value.left, '268px')
  assert.equal(launcher.state.buttonStyle.value.top, '188px')
  assert.equal(launcher.writes.length, 0)
})

test('missing or malformed stored placements keep the default and clicks do not save it', async () => {
  for (const saved of [
    null,
    [],
    {},
    { edge: 'invalid', x: 1, y: 2 },
    { edge: 'left', x: NaN, y: 2 },
    { edge: 'top', x: 1, y: Infinity },
    { edge: 'right', x: '8', y: 20 },
  ]) {
    const launcher = createLauncher(async () => saved)
    await flush()
    assert.equal(launcher.state.buttonStyle.value.left, '948px')
    assert.equal(launcher.state.buttonStyle.value.top, '736px')
    launcher.state.onPointerDown(pointer(948, 736))
    launcher.state.onPointerUp(pointer(948, 736))
    await flush()
    assert.equal(launcher.writes.length, 0)
    launcher.scope.stop()
  }
})

test('a late storage read cannot overwrite a new drag or a disposed launcher', async () => {
  for (const dispose of [false, true]) {
    let resolveRead: (value: unknown) => void = () => {}
    const launcher = createLauncher(
      () =>
        new Promise(resolve => {
          resolveRead = resolve
        }),
    )
    if (dispose) {
      launcher.scope.stop()
    } else {
      launcher.state.onPointerDown(pointer(948, 736))
      launcher.state.onPointerUp(pointer(8, 300))
    }
    resolveRead({ edge: 'top', x: 400, y: 8 })
    await flush()
    assert.equal(
      launcher.state.buttonStyle.value.left,
      dispose ? '948px' : '8px',
    )
    assert.equal(
      launcher.state.buttonStyle.value.top,
      dispose ? '736px' : '300px',
    )
    launcher.scope.stop()
  }
})

test('failed storage reads and writes leave dragging usable and later writes can succeed', async t => {
  let shouldFail = true
  const launcher = createLauncher(
    async () => {
      throw new Error('read failed')
    },
    async () => {
      if (shouldFail) {
        throw new Error('write failed')
      }
    },
  )
  t.after(() => launcher.scope.stop())
  await flush()
  launcher.state.onPointerDown(pointer(948, 736))
  launcher.state.onPointerUp(pointer(8, 300))
  await flush()
  assert.equal(launcher.warnings.length, 2)
  shouldFail = false
  launcher.state.onPointerDown(pointer(8, 300))
  launcher.state.onPointerUp(pointer(400, 8))
  await flush()
  assert.deepEqual(launcher.writes.at(-1), { edge: 'top', x: 400, y: 8 })
  assert.equal(launcher.warnings.length, 2)
})
