import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as vue from 'vue'
import * as video from '../utils/video'
import type { useVideoDownload } from '../composables/useVideoDownload'
import type { DownloadRequest } from '../types/video'

const request: DownloadRequest = {
  type: 'download-video',
  postId: '123',
  mediaIndex: 1,
  url: 'https://video.twimg.com/video.mp4',
}
const duplicateResult = { ok: false, error: 'duplicateDownload' }

/**
 * Loads the inline-download composable with real Vue scope and controlled replies.
 *
 * @param respond - Reply produced for each outgoing download request.
 * @param contextKey - Reactive identity of the inline post.
 * @returns Public inline state, sent requests, and the disposable scope.
 * @throws When an imported dependency is unsupported or initialization fails.
 */
function createInlineDownload(
  respond: (message: Record<string, unknown>) => unknown,
  contextKey = vue.shallowRef('123'),
) {
  const calls: Record<string, unknown>[] = []
  const scope = vue.effectScope()
  const exports: {
    /**
     * Inline composable factory exported by the actual application source.
     */
    useVideoDownload?: typeof useVideoDownload
  } = {}
  const browser = {
    runtime: {
      /**
       * Captures a sent payload and delivers its test-controlled reply.
       *
       * @param message - Single-video download request.
       * @returns The test response or deferred response promise.
       */
      sendMessage(message: Record<string, unknown>) {
        calls.push(structuredClone(message))
        return respond(message)
      },
    },
  }
  runInNewContext(
    ts.transpileModule(
      readFileSync(
        new URL('../composables/useVideoDownload.ts', import.meta.url),
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
      ...vue,
      exports,
      Error,
      i18n: { t: (key: string) => key },
      /**
       * Resolves real data guards and controlled browser/localization dependencies.
       *
       * @param id - Imported module identifier.
       * @returns The requested module adapter.
       * @throws When the composable imports an unsupported module.
       */
      require(id: string) {
        if (id === '#imports') {
          return { ...vue, browser }
        }
        if (id === 'vue') {
          return vue
        }
        if (id === '~/utils/video') {
          return video
        }
        if (id === '~/utils/i18n') {
          return {
            localizeDownloadError: (error: unknown) => `error:${String(error)}`,
          }
        }
        throw new Error(id)
      },
    },
  )
  assert.ok(exports.useVideoDownload)
  const factory = exports.useVideoDownload
  const state = scope.run(() => factory(contextKey))
  assert.ok(state)
  return { state, calls, scope, contextKey }
}

test('inline duplicates require explicit force and clear the prompt after acceptance', async t => {
  const harness = createInlineDownload(message =>
    message['force'] ? { ok: true, downloadId: 42 } : duplicateResult,
  )
  t.after(() => harness.scope.stop())
  assert.equal(await harness.state.download(request), false)
  assert.deepEqual(harness.state.duplicateRequest.value, request)
  assert.equal(harness.state.hasError.value, false)
  assert.equal(harness.state.message.value, '')
  assert.equal(await harness.state.download(request, true), true)
  assert.deepEqual(harness.calls, [
    { ...request, force: false },
    { ...request, force: true },
  ])
  assert.equal(harness.state.duplicateRequest.value, undefined)
  assert.equal(harness.state.message.value, 'downloadQueued')
  assert.equal(harness.state.isPending.value, false)
})

test('inline pending clicks share one request and expose native errors', async t => {
  const response = Promise.withResolvers<unknown>()
  const harness = createInlineDownload(() => response.promise)
  t.after(() => harness.scope.stop())
  const pending = harness.state.download(request)
  assert.equal(await harness.state.download(request), undefined)
  response.resolve({ ok: false, error: 'NETWORK_FAILED' })
  assert.equal(await pending, false)
  assert.equal(harness.calls.length, 1)
  assert.equal(harness.state.hasError.value, true)
  assert.equal(harness.state.message.value, 'error:NETWORK_FAILED')
  assert.equal(harness.state.isPending.value, false)
})

test('old inline replies cannot reopen the panel or restore prompts after post changes', async t => {
  for (const result of [
    duplicateResult,
    { ok: true, downloadId: 42 },
    new Error('Old post failed'),
  ]) {
    const response = Promise.withResolvers<unknown>()
    const harness = createInlineDownload(() => response.promise)
    t.after(() => harness.scope.stop())
    const pending = harness.state.download(request)
    harness.contextKey.value = '456'
    await vue.nextTick()
    harness.contextKey.value = '123'
    await vue.nextTick()
    if (result instanceof Error) {
      response.reject(result)
    } else {
      response.resolve(result)
    }
    assert.equal(await pending, false)
    assert.equal(harness.state.duplicateRequest.value, undefined)
    assert.equal(harness.state.message.value, '')
    assert.equal(harness.state.hasError.value, false)
  }
})

test('disposed inline controls ignore late replies and reject new download attempts', async () => {
  for (const result of [
    duplicateResult,
    { ok: true, downloadId: 42 },
    new Error('Closed control'),
  ]) {
    const response = Promise.withResolvers<unknown>()
    const harness = createInlineDownload(() => response.promise)
    const pending = harness.state.download(request)
    harness.scope.stop()
    if (result instanceof Error) {
      response.reject(result)
    } else {
      response.resolve(result)
    }
    assert.equal(await pending, false)
    assert.equal(harness.state.duplicateRequest.value, undefined)
    assert.equal(harness.state.message.value, 'creatingSave')
    assert.equal(harness.state.hasError.value, false)
    assert.equal(await harness.state.download(request), undefined)
    assert.equal(harness.calls.length, 1)
  }
})
