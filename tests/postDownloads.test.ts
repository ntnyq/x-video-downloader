import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as vue from 'vue'
import * as downloadHistory from '../utils/downloadHistory'
import * as video from '../utils/video'
import type { usePostDownloads } from '../composables/usePostDownloads'
import type { DownloadStatus } from '../types/download'
import type { DownloadRequest } from '../types/video'

const request: DownloadRequest = {
  type: 'download-video',
  postId: '123',
  mediaIndex: 1,
  url: 'https://video.twimg.com/video.mp4',
}
const download: DownloadStatus = {
  id: 42,
  postId: '123',
  mediaIndex: 1,
  filename: 'demo.mp4',
  author: 'Alice',
  startedAt: 1000,
  bytesReceived: 25,
  totalBytes: 100,
  state: 'in_progress',
}

/**
 * Runs the actual composable in a Vue scope with controlled browser responses.
 *
 * @param respond - Runtime message responder for this test.
 * @param postId - Optional reactive post selection, omitted for global history.
 * @param contextKey - Optional visible-page identity for cross-post batches.
 * @returns Public composable state, recorded messages, and manual polling/cleanup.
 * @throws When a module requests an unexpected dependency or cannot initialize.
 */
function createDownloads(
  respond: (message: Record<string, unknown>) => unknown,
  postId?: vue.MaybeRefOrGetter<string>,
  contextKey?: vue.MaybeRefOrGetter<string>,
) {
  const calls: Record<string, unknown>[] = []
  const intervals = new Set<() => void>()
  const scope = vue.effectScope()
  const exports: {
    /**
     * Actual composable factory loaded from the TypeScript module.
     */
    usePostDownloads?: typeof usePostDownloads
  } = {}
  const compiled = ts.transpileModule(
    readFileSync(
      new URL('../composables/usePostDownloads.ts', import.meta.url),
      'utf8',
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const browser = {
    runtime: {
      /**
       * Records a browser-bound payload before delivering its configured response.
       *
       * @param message - Outgoing runtime request.
       * @returns The response or pending response promise supplied by the test.
       */
      sendMessage(message: Record<string, unknown>) {
        calls.push(structuredClone(message))
        return respond(message)
      },
    },
  }
  runInNewContext(compiled, {
    ...vue,
    exports,
    Error,
    i18n: {
      /**
       * Exposes translation identity and substitution arguments for UI assertions.
       *
       * @param key - Requested translation key.
       * @param values - Optional message substitutions.
       * @returns A deterministic readable translation marker.
       */
      t: (key: string, values: unknown[] = []) => `${key}:${values.join('|')}`,
    },
    /**
     * Schedules controllable polling tied to the real Vue effect scope.
     *
     * @param callback - Polling callback requested by the composable.
     */
    useIntervalFn(callback: () => void) {
      intervals.add(callback)
      vue.onScopeDispose(() => intervals.delete(callback))
    },
    /**
     * Resolves auto-imports and real history validation without a browser runtime.
     *
     * @param id - Imported module identifier.
     * @returns Its Vue, browser, validation, or localization adapter.
     * @throws When the module imports an unsupported dependency.
     */
    require(id: string) {
      if (id === '#imports') {
        return { ...vue, browser }
      }
      if (id === '~/utils/downloadHistory') {
        return downloadHistory
      }
      if (id === '~/utils/video') {
        return video
      }
      if (id === '~/utils/i18n') {
        return {
          localizeDownloadError: (error: unknown) => `error:${String(error)}`,
        }
      }
      if (id === 'vue') {
        return vue
      }
      throw new Error(id)
    },
  })
  assert.ok(exports.usePostDownloads)
  const factory = exports.usePostDownloads
  const state = scope.run(() => factory(postId, contextKey))
  assert.ok(state)
  return {
    state,
    calls,
    /**
     * Runs one scheduled poll without advancing wall-clock time.
     */
    poll() {
      for (const callback of intervals) {
        callback()
      }
    },
    /**
     * Disposes the composable and its polling scope.
     */
    stop() {
      scope.stop()
    },
  }
}

test('global history includes multiple posts while post views reject unrelated and invalid records', async t => {
  const response = {
    ok: true,
    downloads: [
      download,
      { ...download, id: 43, postId: '456' },
      { ...download, id: 'bad' },
    ],
  }
  const global = createDownloads(() => response)
  const post = createDownloads(() => response, '123')
  t.after(() => global.stop())
  t.after(() => post.stop())
  await setImmediate()
  assert.deepEqual(
    global.state.downloads.value.map(item => item.id),
    [42, 43],
  )
  assert.deepEqual(
    post.state.downloads.value.map(item => item.id),
    [42],
  )
  assert.equal(global.calls[0]?.['postId'], undefined)
  assert.equal(post.calls[0]?.['postId'], '123')
})

test('duplicate confirmation resubmits only matching post-media pairs and preserves successful downloads', async t => {
  const duplicate = { ...request, postId: '456' }
  const failed = { ...request, postId: '789' }
  const harness = createDownloads(message => {
    if (message['type'] === 'get-downloads') {
      return { ok: true, downloads: [] }
    }
    return {
      ok: true,
      results:
        message['force'] === true
          ? [
              {
                postId: '456',
                mediaIndex: 1,
                result: { ok: true, downloadId: 44 },
              },
            ]
          : [
              {
                postId: '123',
                mediaIndex: 1,
                result: { ok: true, downloadId: 42 },
              },
              {
                postId: '456',
                mediaIndex: 1,
                result: { ok: false, error: 'duplicateDownload' },
              },
              {
                postId: '789',
                mediaIndex: 1,
                result: { ok: false, error: 'NETWORK_FAILED' },
              },
            ],
    }
  })
  t.after(() => harness.stop())
  await setImmediate()
  await harness.state.start([request, duplicate, failed])
  assert.deepEqual(
    [...harness.state.duplicateRequests.value].map(item => item.postId),
    ['456'],
  )
  assert.equal(harness.state.message.value, 'downloadsCreated:1')
  assert.match(harness.state.requestError.value, /789\|1\|error:NETWORK_FAILED/)
  await harness.state.confirmDuplicates()
  const batches = harness.calls.filter(
    item => item['type'] === 'download-videos',
  )
  assert.equal(batches.length, 2)
  assert.deepEqual(batches[1]?.['requests'], [duplicate])
  assert.equal(batches[1]?.['force'], true)
  assert.equal(harness.state.duplicateRequests.value.length, 0)
  assert.equal(harness.state.requestError.value, '')
})

test('dismissing duplicate confirmation never starts another download', async t => {
  const harness = createDownloads(message =>
    message['type'] === 'get-downloads'
      ? { ok: true, downloads: [] }
      : {
          ok: true,
          results: [
            {
              postId: '123',
              mediaIndex: 1,
              result: { ok: false, error: 'duplicateDownload' },
            },
          ],
        },
  )
  t.after(() => harness.stop())
  await setImmediate()
  await harness.state.start([request])
  harness.state.dismissDuplicates()
  await harness.state.confirmDuplicates()
  assert.equal(
    harness.calls.filter(item => item['type'] === 'download-videos').length,
    1,
  )
  assert.equal(harness.state.duplicateRequests.value.length, 0)
})

test('pause and resume send owned actions and refresh the resulting transfer state', async t => {
  let state: DownloadStatus['state'] = 'in_progress'
  const harness = createDownloads(message => {
    if (message['type'] === 'get-downloads') {
      return { ok: true, downloads: [{ ...download, state }] }
    }
    state = message['action'] === 'pause' ? 'paused' : 'in_progress'
    return { ok: true }
  })
  t.after(() => harness.stop())
  await setImmediate()
  await harness.state.action(42, 'pause')
  assert.equal(harness.state.downloads.value[0]?.state, 'paused')
  assert.equal(harness.state.message.value, 'downloadPaused:')
  await harness.state.action(42, 'resume')
  assert.equal(harness.state.downloads.value[0]?.state, 'in_progress')
  assert.equal(harness.state.message.value, 'downloadResumed:')
  assert.deepEqual(
    harness.calls.filter(item => item['type'] === 'download-action'),
    [
      { type: 'download-action', downloadId: 42, action: 'pause' },
      { type: 'download-action', downloadId: 42, action: 'resume' },
    ],
  )
})

test('history clearing sends only terminal IDs selected by the active filters', async t => {
  const history: DownloadStatus[] = [
    { ...download, state: 'complete' },
    { ...download, id: 43, state: 'paused' },
    { ...download, id: 44, author: 'Bob', state: 'complete' },
    { ...download, id: 45, postId: '456', state: 'cancelled' },
  ]
  const harness = createDownloads(message =>
    message['type'] === 'get-downloads'
      ? { ok: true, downloads: history }
      : { ok: true },
  )
  t.after(() => harness.stop())
  await setImmediate()
  const ids = downloadHistory
    .filterDownloadHistory(harness.state.downloads.value, '', 'Alice')
    .filter(downloadHistory.isTerminalDownload)
    .map(item => item.id)
  await harness.state.clear(ids)
  assert.deepEqual(
    harness.calls.find(item => item['type'] === 'clear-downloads'),
    {
      type: 'clear-downloads',
      ids: [42, 45],
    },
  )
  assert.equal(harness.state.message.value, 'historyCleared:')
  await harness.state.clear([])
  assert.equal(
    harness.calls.filter(item => item['type'] === 'clear-downloads').length,
    1,
  )
})

test('pending actions block conflicting clear requests and surface browser failures', async t => {
  const action = Promise.withResolvers<unknown>()
  const harness = createDownloads(message =>
    message['type'] === 'get-downloads'
      ? { ok: true, downloads: [download] }
      : action.promise,
  )
  t.after(() => harness.stop())
  await setImmediate()
  const pending = harness.state.action(42, 'pause')
  assert.equal(harness.state.isActionPending.value, true)
  await harness.state.clear([42])
  await harness.state.action(42, 'resume')
  action.resolve({ ok: false, error: 'NETWORK_FAILED' })
  await pending
  assert.equal(
    harness.calls.filter(item => item['type'] === 'download-action').length,
    1,
  )
  assert.equal(
    harness.calls.filter(item => item['type'] === 'clear-downloads').length,
    0,
  )
  assert.equal(harness.state.isActionPending.value, false)
  assert.equal(harness.state.requestError.value, 'error:NETWORK_FAILED')
})

test('late refreshes cannot replace the selected post after navigation', async t => {
  const initial = Promise.withResolvers<unknown>()
  const postId = vue.shallowRef('123')
  const nextDownload = { ...download, id: 43, postId: '456' }
  const harness = createDownloads(
    message =>
      message['postId'] === '123'
        ? initial.promise
        : { ok: true, downloads: [nextDownload] },
    postId,
  )
  t.after(() => harness.stop())
  postId.value = '456'
  await vue.nextTick()
  initial.resolve({ ok: true, downloads: [download] })
  await setImmediate()
  assert.equal(
    harness.state.downloads.value.some(item => item.postId === '123'),
    false,
  )
  harness.poll()
  await setImmediate()
  assert.deepEqual(harness.state.downloads.value, [nextDownload])
})

test('a failed refresh for a previous post does not show an error for the current post', async t => {
  const initial = Promise.withResolvers<unknown>()
  const postId = vue.shallowRef('123')
  const harness = createDownloads(() => initial.promise, postId)
  t.after(() => harness.stop())
  postId.value = '456'
  await vue.nextTick()
  initial.reject(new Error('Previous tab closed'))
  await setImmediate()
  assert.equal(harness.state.progressError.value, '')
})

test('disposed scopes ignore late progress responses and stop polling', async () => {
  for (const shouldReject of [false, true]) {
    const response = Promise.withResolvers<unknown>()
    const harness = createDownloads(() => response.promise)
    harness.stop()
    if (shouldReject) {
      response.reject(new Error('Closed tab'))
    } else {
      response.resolve({ ok: true, downloads: [download] })
    }
    await setImmediate()
    harness.poll()
    assert.equal(harness.state.downloads.value.length, 0)
    assert.equal(harness.state.progressError.value, '')
    assert.equal(harness.calls.length, 1)
  }
})

test('a pending batch cannot show old duplicates or errors after the selected post changes', async t => {
  for (const shouldReject of [false, true]) {
    const batch = Promise.withResolvers<unknown>()
    const postId = vue.shallowRef('123')
    const harness = createDownloads(
      message =>
        message['type'] === 'get-downloads'
          ? { ok: true, downloads: [] }
          : batch.promise,
      postId,
    )
    t.after(() => harness.stop())
    await setImmediate()
    const pending = harness.state.start([request])
    postId.value = '456'
    await vue.nextTick()
    if (shouldReject) {
      batch.reject(new Error('Old post request failed'))
    } else {
      batch.resolve({
        ok: true,
        results: [
          {
            postId: '123',
            mediaIndex: 1,
            result: { ok: false, error: 'duplicateDownload' },
          },
        ],
      })
    }
    await pending
    assert.equal(harness.state.duplicateRequests.value.length, 0)
    assert.equal(harness.state.requestError.value, '')
    assert.equal(harness.state.message.value, '')
    assert.equal(harness.state.isPending.value, false)
  }
})

test('late actions do not show success or failure on a newly selected post', async t => {
  for (const shouldReject of [false, true]) {
    const action = Promise.withResolvers<unknown>()
    const postId = vue.shallowRef('123')
    const harness = createDownloads(
      message =>
        message['type'] === 'get-downloads'
          ? { ok: true, downloads: [] }
          : action.promise,
      postId,
    )
    t.after(() => harness.stop())
    await setImmediate()
    const pending = harness.state.action(42, 'pause')
    postId.value = '456'
    await vue.nextTick()
    if (shouldReject) {
      action.reject(new Error('Old post pause failed'))
    } else {
      action.resolve({ ok: true })
    }
    await pending
    assert.equal(harness.state.message.value, '')
    assert.equal(harness.state.requestError.value, '')
    assert.equal(harness.state.isActionPending.value, false)
  }
})

test('finishing a batch after disposal does not repopulate prompts or start another refresh', async () => {
  const batch = Promise.withResolvers<unknown>()
  const harness = createDownloads(message =>
    message['type'] === 'get-downloads'
      ? { ok: true, downloads: [] }
      : batch.promise,
  )
  await setImmediate()
  const pending = harness.state.start([request])
  harness.stop()
  const messageAtDisposal = harness.state.message.value
  const callsAtDisposal = harness.calls.length
  batch.resolve({
    ok: true,
    results: [
      {
        postId: '123',
        mediaIndex: 1,
        result: { ok: false, error: 'duplicateDownload' },
      },
    ],
  })
  await pending
  assert.equal(harness.state.duplicateRequests.value.length, 0)
  assert.equal(harness.state.message.value, messageAtDisposal)
  assert.equal(harness.calls.length, callsAtDisposal)
})

test('changing the visible cross-post context invalidates a pending duplicate result', async t => {
  const batch = Promise.withResolvers<unknown>()
  const contextKey = vue.shallowRef('123,456')
  const harness = createDownloads(
    message =>
      message['type'] === 'get-downloads'
        ? { ok: true, downloads: [] }
        : batch.promise,
    undefined,
    contextKey,
  )
  t.after(() => harness.stop())
  await setImmediate()
  const pending = harness.state.start([request])
  contextKey.value = '789'
  await vue.nextTick()
  batch.resolve({
    ok: true,
    results: [
      {
        postId: '123',
        mediaIndex: 1,
        result: { ok: false, error: 'duplicateDownload' },
      },
    ],
  })
  await pending
  assert.equal(harness.state.duplicateRequests.value.length, 0)
  assert.equal(harness.state.message.value, '')
})

test('returning to the same post cannot revive a response from an earlier visit', async t => {
  const batch = Promise.withResolvers<unknown>()
  const postId = vue.shallowRef('123')
  const harness = createDownloads(
    message =>
      message['type'] === 'get-downloads'
        ? { ok: true, downloads: [] }
        : batch.promise,
    postId,
  )
  t.after(() => harness.stop())
  await setImmediate()
  const pending = harness.state.start([request])
  postId.value = '456'
  await vue.nextTick()
  postId.value = '123'
  await vue.nextTick()
  batch.resolve({
    ok: true,
    results: [
      {
        postId: '123',
        mediaIndex: 1,
        result: { ok: false, error: 'duplicateDownload' },
      },
    ],
  })
  await pending
  assert.equal(harness.state.duplicateRequests.value.length, 0)
  assert.equal(harness.state.message.value, '')
})

test('rescanning the same visible post IDs preserves pending replies and duplicate notices', async t => {
  const batch = Promise.withResolvers<unknown>()
  const snapshot = vue.shallowRef({ posts: [{ id: '123' }] })
  const harness = createDownloads(
    message =>
      message['type'] === 'get-downloads'
        ? { ok: true, downloads: [] }
        : batch.promise,
    undefined,
    () => snapshot.value.posts.map(post => post.id).join(','),
  )
  t.after(() => harness.stop())
  await setImmediate()
  const pending = harness.state.start([request])
  snapshot.value = { posts: [{ id: '123' }] }
  await vue.nextTick()
  assert.equal(harness.state.message.value, 'creatingDownload:')

  batch.resolve({
    ok: true,
    results: [
      {
        postId: '123',
        mediaIndex: 1,
        result: { ok: false, error: 'duplicateDownload' },
      },
    ],
  })
  await pending
  assert.equal(harness.state.duplicateRequests.value.length, 1)
  assert.equal(harness.state.message.value, 'downloadsCreated:0')

  snapshot.value = { posts: [{ id: '123' }] }
  await vue.nextTick()
  assert.equal(harness.state.duplicateRequests.value.length, 1)
  assert.equal(harness.state.message.value, 'downloadsCreated:0')

  snapshot.value = { posts: [{ id: '456' }] }
  await vue.nextTick()
  assert.equal(harness.state.duplicateRequests.value.length, 0)
  assert.equal(harness.state.message.value, '')
})
