import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import * as utils from '@ntnyq/utils'
import ts from 'typescript'
import { shallowRef } from 'vue'
import * as constants from '../constants/video'
import { getArticlePostId } from '../entrypoints/content/pageVideos'
import { isRecord } from '../utils/isRecord'
import * as broadcast from '../utils/replay/broadcast'
import * as replayUrl from '../utils/replay/url'
import * as identity from '../utils/video/identity'
import * as posts from '../utils/video/posts'
import * as variants from '../utils/video/variants'
import type { createPageVideos } from '../entrypoints/content/pageVideos'

test('skips unrelated timestamps and malformed media links when locating a post', () => {
  const timestamp = (href: string) => ({
    closest: (selector: string) => (selector === 'a[href]' ? { href } : null),
  })
  const timestamps = [
    timestamp('https://x.com/home'),
    timestamp('https://x.com/author/status/123'),
  ]
  const links = [
    { href: 'https://[invalid/status/999/video/1' },
    { href: 'https://x.com/author/status/456/video/1' },
  ]
  const article = {
    querySelector: () => null,
    querySelectorAll(selector: string) {
      return selector === 'time' ? timestamps : links
    },
  } as unknown as Element

  assert.equal(getArticlePostId(article), '123')
  timestamps.pop()
  assert.equal(getArticlePostId(article), '456')
})

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

function createPageHarness(
  href = 'https://x.com/home',
  metadata = new Map<string, string>(),
) {
  const harness = createContext()
  /**
   * Provides an inert mutation callback until the observer fixture is constructed.
   */
  let mutationCallback = () => {}
  let disconnected = false
  const location = { href, origin: 'https://x.com' }
  const exports: { createPageVideos?: typeof createPageVideos } = {}

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
      head: {
        querySelector(selector: string) {
          const content = metadata.get(selector)

          return content === undefined ? null : { content }
        },
      },
      /**
       * Simulates a page with no timeline articles or video elements.
       *
       * @returns An empty element list.
       */
      querySelectorAll: () => [],
    },
    location,
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
      if (id === '@ntnyq/utils') {
        return utils
      }

      if (id === 'vue') {
        return {
          shallowRef,
        }
      }

      if (id === '~/constants/video') {
        return constants
      }

      if (id === '~/utils/replay/broadcast') {
        return broadcast
      }

      if (id === '~/utils/replay/url') {
        return replayUrl
      }

      if (id === '~/utils/isRecord') {
        return {
          isRecord,
        }
      }

      if (id === '~/utils/video/identity') {
        return identity
      }

      if (id === '~/utils/video/posts') {
        return posts
      }

      if (id === '~/utils/video/variants') {
        return variants
      }

      throw new Error(id)
    },
  })
  assert.ok(exports.createPageVideos)
  const videos = exports.createPageVideos(
    harness.ctx as unknown as Parameters<typeof createPageVideos>[0],
  )

  return {
    ...harness,
    location,
    videos,
    mutate: () => mutationCallback(),
    isDisconnected: () => disconnected,
  }
}

test('shows and opens a standalone broadcast replay from the page metadata before playback', () => {
  const id = '2ZBKOYylEAJRgV'
  const playlist =
    'https://prod-fastly-p.video.pscp.tv/replay/master.m3u8?source=example'
  const state = 'meta[name="twitter:string:broadcast_state"]'
  const source = 'meta[property="og:video:secure_url"]'
  const metadata = new Map([
    ['meta[name="twitter:text:broadcast_id"]', id],
    ['meta[name="twitter:text:broadcast_title"]', 'A broadcast replay'],
    ['meta[name="twitter:text:broadcaster_username"]', 'streamer'],
    [state, 'ENDED'],
    [source, playlist],
  ])
  const { location, videos } = createPageHarness(
    `https://x.com/i/broadcasts/${id}`,
    metadata,
  )

  videos.scan()
  const [post] = videos.snapshot.value.posts

  assert.equal(post?.broadcastId, id)
  assert.equal(post.text, 'A broadcast replay')
  assert.equal(post.author, 'streamer')
  assert.equal(videos.getReplay(id)?.playlist, playlist)

  metadata.set(state, 'RUNNING')
  assert.equal(videos.getReplay(id), undefined)
  assert.equal(videos.snapshot.value.posts.length, 0)

  metadata.set(state, 'ENDED')
  metadata.set(
    source,
    'https://prod-fastly-p.video.pscp.tv.example/replay.m3u8',
  )
  assert.equal(videos.getReplay(id), undefined)
  assert.equal(videos.snapshot.value.posts.length, 0)

  metadata.set('meta[property="og:video:url"]', playlist)
  assert.equal(videos.getReplay(id)?.playlist, playlist)

  metadata.set(source, playlist)
  location.href = 'https://x.com/i/broadcasts/DifferentBroadcast'
  assert.equal(videos.getReplay(id), undefined)
  assert.equal(videos.snapshot.value.posts.length, 0)
})

test('repeated scans keep cleanup bounded and cancel pending work on invalidation', () => {
  const harness = createPageHarness()
  const { videos } = harness
  let scans = 0

  videos.observe(() => scans++)
  assert.equal(harness.timers.size, 0, 'initial scan cancels the replay timer')
  const initialCallbacks = harness.invalidationCallbacks.size

  for (let index = 0; index < 100; index++) {
    harness.mutate()
    harness.mutate()
    assert.equal(harness.timers.size, 1)
    harness.flushTimers()
  }

  assert.equal(scans, 101)
  assert.equal(harness.invalidationCallbacks.size, initialCallbacks)

  harness.mutate()
  videos.scan()
  assert.equal(harness.timers.size, 0, 'manual scan cancels queued work')
  harness.mutate()
  harness.invalidate()
  assert.equal(harness.timers.size, 0)
  assert.equal(harness.isDisconnected(), true)
  harness.flushTimers()
  harness.mutate()
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

          return {
            remove,
          }
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
