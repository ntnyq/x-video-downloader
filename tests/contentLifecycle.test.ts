import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { shallowRef } from 'vue'
import * as constants from '../constants/video'
import * as video from '../utils/video'

/**
 * Creates a controllable WXT context with observable timers and invalidation callbacks.
 *
 * @returns The mock context, tracked resources, and helpers for timer execution and teardown.
 */
function createContext() {
  const invalidationCallbacks = new Set<() => void>()
  const timers = new Map<number, () => void>()
  let nextTimer = 0
  const ctx = {
    isInvalid: false,
    /**
     * Exposes the inverse of the simulated context's invalidation flag.
     *
     * @returns Whether the mock context can still schedule work.
     */
    get isValid(): boolean {
      return !ctx.isInvalid
    },
    options: { cssInjectionMode: 'ui' },
    /**
     * Tracks a teardown callback and exposes its unregister operation.
     *
     * @param callback - Cleanup registered by the code under test.
     * @returns A function that removes the callback from the tracked set.
     */
    onInvalidated(callback: () => void) {
      invalidationCallbacks.add(callback)
      return () => invalidationCallbacks.delete(callback)
    },
    /**
     * Accepts page event registration without installing real DOM listeners.
     */
    addEventListener() {},
    /**
     * Schedules a timer with the per-timer invalidation behavior of the WXT fixture.
     *
     * @param callback - Work to execute when the fixture flushes timers.
     * @returns The synthetic timer identifier.
     */
    setTimeout(callback: () => void) {
      const id = setTimer(callback)
      ctx.onInvalidated(() => timers.delete(id))
      return id
    },
  }
  /**
   * Queues a callback in the controllable timer map.
   *
   * @param callback - Work to execute when timers are flushed.
   * @returns The new synthetic timer identifier.
   */
  function setTimer(callback: () => void) {
    const id = ++nextTimer
    timers.set(id, callback)
    return id
  }
  /**
   * Executes and removes each timer that was pending at the start of the flush.
   */
  function flushTimers() {
    for (const [id, callback] of [...timers]) {
      timers.delete(id)
      callback()
    }
  }
  /**
   * Marks the simulated context invalid and invokes its registered cleanup callbacks.
   */
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

/**
 * Transpiles a repository TypeScript module to CommonJS for execution in a VM.
 *
 * @param filename - Module path relative to this test file.
 * @returns The transpiled JavaScript source.
 * @throws When the module cannot be read from disk.
 */
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
  /**
   * Provides an inert mutation callback until the observer fixture is constructed.
   */
  let mutationCallback = () => {}
  let scans = 0
  let disconnected = false
  const exports: {
    /**
     * Factory exported by the transpiled page-video module.
     *
     * @param ctx - Simulated content-script context.
     * @returns Page observation and scan operations.
     */
    createPageVideos?: (ctx: typeof harness.ctx) => {
      /**
       * Registers the test subscriber notified after each scan.
       *
       * @param callback - Subscriber counting completed scans.
       */
      observe: (callback: () => void) => void
      /**
       * Runs a page scan immediately using the simulated DOM.
       */
      scan: () => void
    }
  } = {}
  runInNewContext(compile('../entrypoints/content/pageVideos.ts'), {
    exports,
    window: {
      /**
       * Accepts capture replay messages without dispatching them in the DOM fixture.
       */
      postMessage() {},
      setTimeout: harness.setTimer,
      /**
       * Removes a pending timer from the simulated page.
       *
       * @param id - Synthetic timer identifier to cancel.
       * @returns Whether the timer was present before removal.
       */
      clearTimeout: (id: number) => harness.timers.delete(id),
    },
    document: {
      body: {},
      /**
       * Simulates a page with no timeline articles or video elements.
       *
       * @returns An empty element list.
       */
      querySelectorAll: () => [],
    },
    location: { href: 'https://x.com/home', origin: 'https://x.com' },
    MutationObserver: class {
      /**
       * Captures the mutation observer callback for explicit test delivery.
       *
       * @param callback - Scan scheduler registered by the page-video controller.
       */
      constructor(callback: () => void) {
        mutationCallback = callback
      }
      /**
       * Accepts observation setup without attaching to a real document.
       */
      observe() {}
      /**
       * Records that the page-video controller disconnected its observer.
       */
      disconnect() {
        disconnected = true
      }
    },
    /**
     * Resolves page-video dependencies to Vue and the real parsing helpers.
     *
     * @param id - Module identifier requested by the transpiled controller.
     * @returns The corresponding application module.
     * @throws When the controller requests an unexpected module.
     */
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
    /**
     * Optional teardown callback invoked when a mock shadow UI is removed.
     */
    onRemove?: () => void
  }
  const exports: {
    /**
     * Factory exported by the transpiled disposable shadow-UI module.
     *
     * @param ctx - Simulated content-script context whose callbacks are counted.
     * @param options - Removal callback supplied by the fixture.
     * @returns A promise resolving to the removable UI handle.
     */
    createDisposableShadowRootUi?: (
      ctx: typeof harness.ctx,
      options: UiOptions,
    ) => Promise<{
      /**
       * Removes the mock UI and invokes its configured teardown callback.
       */
      remove: () => void
    }>
  } = {}
  runInNewContext(compile('../entrypoints/content/shadowUi.ts'), {
    exports,
    /**
     * Supplies a controlled WXT shadow-UI factory for callback cleanup assertions.
     *
     * @param id - Module identifier requested by the disposable UI module.
     * @returns The mocked shadow-UI factory module.
     * @throws When an unexpected module is requested.
     */
    require(id: string) {
      if (id !== 'wxt/utils/content-script-ui/shadow-root') {
        throw new Error(id)
      }
      return {
        /**
         * Simulates WXT invalidation registration and optional UI-creation failure.
         *
         * @param ctx - Proxied content-script context under test.
         * @param options - Removal hook supplied to the shadow-UI factory.
         * @returns A removable mock UI handle.
         * @throws When UI creation is configured to fail or the context proxy loses its options.
         */
        async createShadowRootUi(ctx: typeof harness.ctx, options: UiOptions) {
          assert.equal(ctx.options.cssInjectionMode, 'ui')
          /**
           * Invokes the mock UI removal hook when the UI is removed or its context invalidates.
           */
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
  /**
   * Creates a disposable UI whose teardown increments the test's removal counter.
   *
   * @returns A promise resolving to the disposable mock UI.
   * @throws When the configured mock factory fails.
   */
  const createUi = () =>
    createShadowUi(harness.ctx, {
      /**
       * Counts UI removals observed by the fixture.
       *
       * @returns The removal count before this callback increments it.
       */
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
