import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { shallowRef } from 'vue'
import * as constants from '../constants/video'
import * as video from '../utils/video'

function createContext() {
  const invalidationCallbacks = new Set<() => void>()
  const timers = new Map<number, () => void>()
  let nextTimer = 0
  const ctx = {
    isInvalid: false,
    get isValid(): boolean {
      return !ctx.isInvalid
    },
    options: { cssInjectionMode: 'ui' },
    onInvalidated(callback: () => void) {
      invalidationCallbacks.add(callback)
      return () => invalidationCallbacks.delete(callback)
    },
    addEventListener() {},
    setTimeout(callback: () => void) {
      const id = setTimer(callback)
      ctx.onInvalidated(() => timers.delete(id))
      return id
    },
  }
  function setTimer(callback: () => void) {
    const id = ++nextTimer
    timers.set(id, callback)
    return id
  }
  function flushTimers() {
    for (const [id, callback] of [...timers]) {
      timers.delete(id)
      callback()
    }
  }
  function invalidate() {
    ctx.isInvalid = true
    for (const callback of invalidationCallbacks) {
      callback()
    }
  }
  return {
    ctx,
    invalidationCallbacks,
    timers,
    setTimer,
    flushTimers,
    invalidate,
  }
}

function compile(filename: string) {
  return ts.transpileModule(
    readFileSync(new URL(filename, import.meta.url), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
}

test('repeated scans keep cleanup bounded and cancel pending work on invalidation', () => {
  const harness = createContext()
  let mutationCallback = () => {}
  let scans = 0
  let disconnected = false
  const exports: {
    createPageVideos?: (ctx: typeof harness.ctx) => {
      observe: (callback: () => void) => void
      scan: () => void
    }
  } = {}
  runInNewContext(compile('../entrypoints/content/pageVideos.ts'), {
    exports,
    window: {
      postMessage() {},
      setTimeout: harness.setTimer,
      clearTimeout: (id: number) => harness.timers.delete(id),
    },
    document: { body: {}, querySelectorAll: () => [] },
    location: { href: 'https://x.com/home', origin: 'https://x.com' },
    MutationObserver: class {
      constructor(callback: () => void) {
        mutationCallback = callback
      }
      observe() {}
      disconnect() {
        disconnected = true
      }
    },
    require(id: string) {
      if (id === 'vue') {
        return { shallowRef }
      }
      if (id === '~/constants/video') {
        return constants
      }
      if (id === '~/utils/video') {
        return video
      }
      throw new Error(id)
    },
  })
  assert.ok(exports.createPageVideos)
  const videos = exports.createPageVideos(harness.ctx)
  videos.observe(() => scans++)
  assert.equal(harness.timers.size, 0, 'initial scan cancels the replay timer')
  const initialCallbacks = harness.invalidationCallbacks.size
  for (let index = 0; index < 100; index++) {
    mutationCallback()
    mutationCallback()
    assert.equal(harness.timers.size, 1)
    harness.flushTimers()
  }
  assert.equal(scans, 101)
  assert.equal(harness.invalidationCallbacks.size, initialCallbacks)

  mutationCallback()
  videos.scan()
  assert.equal(harness.timers.size, 0, 'manual scan cancels queued work')
  mutationCallback()
  harness.invalidate()
  assert.equal(harness.timers.size, 0)
  assert.equal(disconnected, true)
  harness.flushTimers()
  mutationCallback()
  videos.scan()
  assert.equal(harness.timers.size, 0)
  assert.equal(scans, 102)
})

test('removed shadow UIs release callbacks while live UIs still invalidate', async () => {
  const harness = createContext()
  let removals = 0
  let shouldFail = false
  interface UiOptions {
    onRemove?: () => void
  }
  const exports: {
    createDisposableShadowRootUi?: (
      ctx: typeof harness.ctx,
      options: UiOptions,
    ) => Promise<{ remove: () => void }>
  } = {}
  runInNewContext(compile('../entrypoints/content/shadowUi.ts'), {
    exports,
    require(id: string) {
      if (id !== 'wxt/utils/content-script-ui/shadow-root') {
        throw new Error(id)
      }
      return {
        async createShadowRootUi(ctx: typeof harness.ctx, options: UiOptions) {
          assert.equal(ctx.options.cssInjectionMode, 'ui')
          const remove = () => options.onRemove?.()
          ctx.onInvalidated(remove)
          if (shouldFail) {
            throw new Error('UI creation failed')
          }
          return { remove }
        },
      }
    },
  })
  assert.ok(exports.createDisposableShadowRootUi)
  const createShadowUi = exports.createDisposableShadowRootUi
  const createUi = () =>
    createShadowUi(harness.ctx, {
      onRemove: () => removals++,
    })
  for (let index = 0; index < 100; index++) {
    const ui = await createUi()
    assert.equal(harness.invalidationCallbacks.size, 1)
    ui.remove()
    assert.equal(harness.invalidationCallbacks.size, 0)
  }
  assert.equal(removals, 100)

  shouldFail = true
  await assert.rejects(createUi(), /UI creation failed/)
  assert.equal(harness.invalidationCallbacks.size, 0)
  shouldFail = false
  await createUi()
  await createUi()
  harness.invalidate()
  assert.equal(removals, 102)
  assert.equal(harness.invalidationCallbacks.size, 0)
})
