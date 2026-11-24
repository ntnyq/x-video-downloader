import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import * as utils from '@ntnyq/utils'
import ts from 'typescript'
import { createDownloadManager } from '../entrypoints/background/downloadManager'
import * as requests from '../utils/download/requests'
import * as sender from '../utils/extension/sender'
import { isRecord } from '../utils/isRecord'
import * as broadcast from '../utils/replay/broadcast'
import * as identity from '../utils/video/identity'
import * as variants from '../utils/video/variants'

const request = {
  type: 'download-video',
  postId: '2105974296740811141',
  mediaIndex: 2,
  url: 'https://video.twimg.com/ext_tw_video/1/pu/vid/1280x720/sample.mp4',
}
const popupUrl = 'chrome-extension://test/popup.html'
const replay = {
  post: {
    id: 'broadcast-replay123',
    broadcastId: 'replay123',
    text: '',
    media: [],
  },
  playlist: 'https://video.twimg.com/replay/source.m3u8',
}

type Sender = {
  /**
   * Extension identifier supplied to the simulated message listener.
   */
  id: string
  /**
   * Popup or content-script URL supplied by the simulated sender.
   */
  url: string
  /**
   * Optional tab marker used to simulate a content-script sender.
   */
  tab?: object
}
type Listener = (
  message: unknown,
  sender: Sender,
  respond: (value: unknown) => void,
) => unknown
type InstalledDetails = {
  reason: string
  previousVersion?: string
}
type DownloadDelta = { id: number; state?: { current: 'in_progress' } }

/**
 * Runs the background entrypoint against in-memory browser and storage adapters.
 *
 * @param shouldFail - Whether native download attempts should simulate user cancellation.
 * @param isDevelopment - Whether the background is running in WXT development mode.
 * @returns Recorded download options and a helper for sending runtime messages.
 * @throws When the entrypoint cannot be loaded or requests an unexpected dependency.
 */
function createBackground(shouldFail = false, isDevelopment = false) {
  const calls: unknown[] = []
  const openedUrls: string[] = []
  const warnings: unknown[][] = []
  let listener: Listener | undefined
  let installedListener:
    | ((details: InstalledDetails) => Promise<void>)
    | undefined
  const changedListeners = new Set<(delta: DownloadDelta) => void>()
  let erasedListener: ((id: number) => void) | undefined
  let nextId = 42
  const items = new Map<
    number,
    {
      id: number
      url: string
      byExtensionId?: string
      state: 'in_progress' | 'complete' | 'interrupted'
      bytesReceived: number
      totalBytes: number
      paused?: boolean
      error?: string
    }
  >()
  const browser = {
    runtime: {
      id: 'test',
      /**
       * Resolves extension page URLs for navigation tests.
       *
       * @returns An absolute URL in the test extension.
       */
      getURL: (path: string) => `chrome-extension://test${path}`,
      getManifest() {
        return {
          version: '0.0.3',
        }
      },
      /**
       * Records settings navigation or simulates a browser API failure.
       */
      async openOptionsPage() {
        if (shouldFail) {
          throw new Error('OPTIONS_FAILED')
        }

        calls.push('open-settings')
      },
      onMessage: {
        /**
         * Captures the background message listener for test-driven message delivery.
         *
         * @param callback - Listener registered by the background entrypoint.
         */
        addListener(callback: Listener) {
          listener = callback
        },
      },
      onInstalled: {
        /**
         * Captures the listener for installation and update lifecycle tests.
         */
        addListener(callback: (details: InstalledDetails) => Promise<void>) {
          installedListener = callback
        },
      },
    },
    tabs: {
      async query() {
        return [{ id: 7, url: 'https://x.com/home' }]
      },
      async sendMessage(
        tabId: number,
        message: { type: string; broadcastId: string },
        options: { frameId: number },
      ) {
        if (
          tabId === 7
          && message.type === 'get-captured-broadcast-replay'
          && message.broadcastId === replay.post.broadcastId
          && options.frameId === 0
        ) {
          return replay
        }
      },
      async create({ url }: { url: string }) {
        if (shouldFail) {
          throw new Error('TAB_FAILED')
        }

        openedUrls.push(url)
      },
    },
    commands: {
      onCommand: {
        /**
         * Ignores command listeners because keyboard shortcuts are outside these message tests.
         */
        addListener() {},
      },
    },
    downloads: {
      onChanged: {
        addListener(callback: (delta: DownloadDelta) => void) {
          changedListeners.add(callback)
        },
        removeListener(callback: (delta: DownloadDelta) => void) {
          changedListeners.delete(callback)
        },
      },
      onErased: {
        addListener(callback: (id: number) => void) {
          erasedListener = callback
        },
      },
      async pause(id: number) {
        const item = items.get(id)

        if (item) {
          item.paused = true
        }
      },
      async resume(id: number) {
        const item = items.get(id)

        if (item) {
          item.paused = false
        }
      },
      /**
       * Simulates the absence of previously recorded browser downloads.
       *
       * @returns A promise resolving to an empty native-download list.
       */
      async search({ id }: { id: number }) {
        return items.has(id) ? [items.get(id)] : []
      },
      /**
       * Accepts cancellation without a native browser in this harness.
       *
       * @returns A resolved cancellation promise.
       */
      async cancel(id: number) {
        const item = items.get(id)

        if (item) {
          item.state = 'interrupted'
          item.error = 'USER_CANCELED'
        }
      },
      /**
       * Records native download options and simulates browser acceptance or cancellation.
       *
       * @param options - Options passed to the mocked downloads API.
       * @param options.url - Original URL reported by the native download item.
       * @returns The fixed browser download identifier 42.
       * @throws With USER_CANCELED when this harness is configured to reject downloads.
       */
      async download(options: { url: string }) {
        calls.push(options)

        if (shouldFail) {
          throw new Error('USER_CANCELED')
        }

        const id = nextId++

        items.set(id, {
          id,
          url: options.url,
          byExtensionId: browser.runtime.id,
          state: 'in_progress',
          bytesReceived: 0,
          totalBytes: 100,
        })

        return id
      },
    },
  }
  const exports: {
    /**
     * Transpiled background initializer exposed by the VM module.
     */
    default?: () => void
  } = {}
  const source = readFileSync(
    new URL('../entrypoints/background/index.ts', import.meta.url),
    'utf8',
  )
  const compiled = ts.transpileModule(
    source.replaceAll('import.meta.env.DEV', () => String(isDevelopment)),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText

  runInNewContext(compiled, {
    exports,
    Error,
    structuredClone,
    /**
     * Resolves the background entrypoint's dependencies to controlled test adapters.
     *
     * @param id - Module identifier requested by the transpiled entrypoint.
     * @returns The matching browser, storage, or application module.
     * @throws When the entrypoint imports an unexpected module.
     */
    require(id: string) {
      if (id === '@ntnyq/utils') {
        return utils
      }

      if (id === '~/utils/logger') {
        return {
          logger: {
            withTag() {
              return {
                warn(...args: unknown[]) {
                  warnings.push(args)
                },
              }
            },
          },
        }
      }

      if (id === '#imports') {
        return {
          browser,
          /**
           * Preserves the background initializer for explicit execution by the harness.
           *
           * @param main - Initializer provided by the transpiled entrypoint.
           * @returns The unchanged initializer.
           */
          defineBackground: (main: unknown) => main,
        }
      }

      if (id === '~/utils/download/requests') {
        return requests
      }

      if (id === '~/utils/extension/sender') {
        return sender
      }

      if (id === '~/utils/replay/broadcast') {
        return broadcast
      }

      if (id === '~/utils/isRecord') {
        return {
          isRecord,
        }
      }

      if (id === '~/utils/video/identity') {
        return identity
      }

      if (id === '~/utils/video/variants') {
        return variants
      }

      if (id === '~/utils/storage/downloadPreferences') {
        return {
          /**
           * Supplies deterministic filename and save-dialog preferences for assertions.
           *
           * @returns Preferences disabling save dialogs and using post ID and media index in filenames.
           */
          async getDownloadPreferences() {
            return {
              concurrency: 1,
              saveAs: false,
              filenameTemplate: 'X-{postId}-{index}',
            }
          },
          concurrencySetting: { watch() {} },
        }
      }

      if (id === '~/utils/storage/downloadRecords') {
        return {
          downloadRecords: {
            /**
             * Starts the fixture with no persisted download records.
             *
             * @returns An empty record array.
             */
            getValue: async () => [],
            /**
             * Accepts record writes without persisting them across test harnesses.
             *
             * @returns A resolved storage-write promise.
             */
            setValue: async () => {},
          },
        }
      }

      if (id === './downloadManager') {
        return {
          createDownloadManager,
        }
      }

      throw new Error(id)
    },
  })
  exports.default?.()

  /**
   * Delivers a message to the captured runtime listener and waits for its response.
   *
   * @param message - Payload to deliver to the background entrypoint.
   * @param sender - Simulated browser sender metadata.
   * @returns A promise resolving with the listener's response payload.
   */
  function send(message: unknown, sender: Sender) {
    return new Promise<unknown>(resolve => {
      if (listener?.(message, sender, resolve) !== true) {
        resolve(undefined)
      }
    })
  }

  return {
    calls,
    openedUrls,
    warnings,
    installed: (details: InstalledDetails) => installedListener?.(details),
    send,
    items,
    browser,
    changed(id: number, state?: DownloadDelta['state']) {
      for (const listener of changedListeners) {
        listener({ id, state })
      }
    },
    erased: (id: number) => erasedListener?.(id),
  }
}

test('rejects controls when a stored native ID belongs to another browser download', async () => {
  const background = createBackground()
  const sender = { id: 'test', url: popupUrl }

  await background.send(request, sender)

  const item = background.items.get(42)!

  delete item.byExtensionId
  const result = await background.send(
    { type: 'download-action', downloadId: 42, action: 'cancel' },
    sender,
  )

  assert.equal(isRecord(result) && result['error'], 'finishedDownload')
  assert.equal(item.state, 'in_progress')
})

test('waits for Firefox resume to start without waiting for transfer completion', async t => {
  const background = createBackground()
  const sender = { id: 'test', url: popupUrl }
  const requested = Promise.withResolvers<void>()
  const completed = Promise.withResolvers<void>()

  await background.send(request, sender)

  const item = background.items.get(42)!

  item.paused = true
  item.state = 'interrupted'
  item.error = 'USER_CANCELED'
  const resume = t.mock.method(background.browser.downloads, 'resume', () => {
    requested.resolve()

    return completed.promise
  })

  const response = background.send(
    { type: 'download-action', downloadId: 42, action: 'resume' },
    sender,
  )

  await Promise.race([requested.promise, response])
  assert.equal(resume.mock.callCount(), 1)
  item.state = 'in_progress'
  item.paused = false
  delete item.error
  background.changed(42, { current: 'in_progress' })

  try {
    const result = await response

    assert.equal(isRecord(result) && result['ok'], true)
  } finally {
    completed.resolve()
  }
})

test('opens a replay task only for an ID captured on the source tab', async () => {
  const background = createBackground()
  const sender = { id: 'test', url: 'https://x.com/home', tab: { id: 7 } }
  const kind = 'open-broadcast-replay-v1'

  await background.send(
    { type: kind, broadcastId: 'other', playlist: replay.playlist },
    sender,
  )
  await background.send(
    { type: kind, broadcastId: 'replay123' },
    { ...sender, id: 'other' },
  )
  assert.deepEqual(background.openedUrls, [])

  await background.send({ type: kind, broadcastId: 'replay123' }, sender)
  assert.deepEqual(background.openedUrls, [
    'chrome-extension://test/replay.html#7/replay123',
  ])
  assert.deepEqual(background.calls, [])
})

test('a popup hosted in a tab still opens the replay from the active X tab', async () => {
  const background = createBackground()

  await background.send(
    { type: 'open-broadcast-replay-v1', broadcastId: 'replay123' },
    { id: 'test', url: popupUrl, tab: { id: 8 } },
  )

  assert.deepEqual(background.openedUrls, [
    'chrome-extension://test/replay.html#7/replay123',
  ])
})

test('returns captured playlist data only to the matching extension task page', async () => {
  const background = createBackground()
  const type = 'get-broadcast-replay-v1'

  const unauthorized = await background.send(
    { type },
    { id: 'test', url: popupUrl },
  )

  assert.equal(isRecord(unauthorized) && unauthorized['ok'], false)

  const result = await background.send(
    { type, broadcastId: 'other' },
    {
      id: 'test',
      url: 'chrome-extension://test/replay.html#7/replay123',
    },
  )

  assert.equal(isRecord(result) && result['ok'], true)
  assert.deepEqual(isRecord(result) && result['replay'], replay)
})

test('first installation opens the welcome page only', async () => {
  const background = createBackground()

  await background.installed({ reason: 'install' })
  assert.deepEqual(background.openedUrls, [
    'chrome-extension://test/welcome.html',
  ])
})

test('version updates open the bundled changelog, including skipped releases', async () => {
  for (const previousVersion of ['0.0.1', '0.0.2', undefined]) {
    const background = createBackground()

    await background.installed({ reason: 'update', previousVersion })
    assert.deepEqual(background.openedUrls, [
      'chrome-extension://test/changelog.html',
    ])
  }
})

test('same-version reloads, browser updates and development updates do not open release notes', async () => {
  const background = createBackground()

  await background.installed({ reason: 'update', previousVersion: '0.0.3' })
  await background.installed({ reason: 'chrome_update' })
  await background.installed({ reason: 'shared_module_update' })
  assert.deepEqual(background.openedUrls, [])

  const development = createBackground(false, true)

  await development.installed({ reason: 'update', previousVersion: '0.0.2' })
  assert.deepEqual(development.openedUrls, [])
})

test('failed introduction tabs are logged without rejecting the installation listener', async () => {
  for (const reason of ['install', 'update']) {
    const background = createBackground(true)

    await background.installed({ reason, previousVersion: '0.0.2' })
    assert.deepEqual(background.openedUrls, [])
    assert.equal(background.warnings.length, 1)
    assert.equal(
      background.warnings[0]?.[0],
      'Could not open the extension introduction page',
    )
    assert.equal(String(background.warnings[0]?.[1]), 'Error: TAB_FAILED')
  }
})

test('background starts downloads with chosen quality, stable filename and saved preference', async () => {
  const background = createBackground()
  const result = await background.send(request, { id: 'test', url: popupUrl })

  assert.equal(
    JSON.stringify(result),
    JSON.stringify({ ok: true, downloadId: 42 }),
  )
  assert.equal(
    JSON.stringify(background.calls[0]),
    JSON.stringify({
      url: request.url,
      filename: 'X-2105974296740811141-2.mp4',
      conflictAction: 'uniquify',
      saveAs: false,
    }),
  )
})

test('background returns browser failures to the content script', async () => {
  const background = createBackground(true)
  const result = await background.send(request, {
    id: 'test',
    url: 'https://x.com/home',
    tab: {},
  })

  assert.equal(
    JSON.stringify(result),
    JSON.stringify({ ok: false, error: 'USER_CANCELED' }),
  )
})

test('background never starts a download for untrusted senders or URLs', async () => {
  const background = createBackground()

  await background.send(request, { id: 'other', url: popupUrl })
  await background.send(
    { ...request, url: 'https://example.com/video.mp4' },
    { id: 'test', url: popupUrl },
  )
  assert.equal(background.calls.length, 0)
})

test('opens settings for this extension on X while rejecting untrusted senders', async () => {
  const background = createBackground()
  const message = { type: 'open-settings' }
  const result = await background.send(message, {
    id: 'test',
    url: 'https://x.com/home',
    tab: {},
  })

  assert.equal(JSON.stringify(result), JSON.stringify({ ok: true }))
  assert.deepEqual(background.calls, ['open-settings'])

  for (const sender of [
    { id: 'other', url: 'https://x.com/home', tab: {} },
    { id: 'test', url: 'https://example.com/', tab: {} },
  ]) {
    const rejected = await background.send(message, sender)

    assert.equal(
      JSON.stringify(rejected),
      JSON.stringify({ ok: false, error: 'invalidSender' }),
    )
  }

  assert.equal(background.calls.length, 1)
})

test('reports a settings navigation failure to the requesting panel', async () => {
  const background = createBackground(true)
  const result = await background.send(
    { type: 'open-settings' },
    { id: 'test', url: 'https://x.com/home', tab: {} },
  )

  assert.equal(
    JSON.stringify(result),
    JSON.stringify({ ok: false, error: 'OPTIONS_FAILED' }),
  )
})

test('background advances cross-post queues from native completion and erased events', async () => {
  const background = createBackground()
  const sender = { id: 'test', url: popupUrl }

  await background.send(
    {
      type: 'download-videos',
      requests: [
        request,
        { ...request, postId: '456' },
        { ...request, postId: '789' },
      ],
    },
    sender,
  )
  assert.equal(background.calls.length, 1)
  background.items.get(42)!.state = 'complete'
  background.changed(42)
  await background.send({ type: 'get-downloads' }, sender)
  assert.equal(background.calls.length, 2)
  background.items.delete(43)
  background.erased(43)
  await background.send({ type: 'get-downloads' }, sender)
  assert.equal(background.calls.length, 3)
})

test('validates management payloads and repeat confirmation before native effects', async () => {
  const background = createBackground()
  const sender = { id: 'test', url: popupUrl }
  const sparseIds = [42]
  const sparseRequests = [request]

  sparseIds.length = 2
  sparseRequests.length = 2

  for (const message of [
    { ...request, force: 'yes' },
    { type: 'get-downloads', postId: 'invalid' },
    { type: 'download-action', downloadId: 42.5, action: 'pause' },
    { type: 'download-action', downloadId: 42, action: 'erase' },
    { type: 'clear-downloads', ids: ['42'] },
    { type: 'clear-downloads', ids: [42.5] },
    { type: 'clear-downloads', ids: sparseIds },
    { type: 'download-videos', requests: [request, request] },
    { type: 'download-videos', requests: sparseRequests },
  ]) {
    assert.equal(
      JSON.stringify(await background.send(message, sender)),
      JSON.stringify({ ok: false, error: 'invalidRequest' }),
    )
  }

  for (const message of [
    { type: 'get-downloads' },
    { type: 'clear-downloads' },
    { type: 'download-action', downloadId: 42, action: 'pause' },
    { type: 'download-action', downloadId: 42, action: 'resume' },
  ]) {
    assert.equal(
      JSON.stringify(
        await background.send(message, { id: 'other', url: popupUrl }),
      ),
      JSON.stringify({ ok: false, error: 'invalidSender' }),
    )
  }

  assert.equal(background.calls.length, 0)
})

test('ignores non-string message types without coercing them', async () => {
  const background = createBackground()
  const sender = { id: 'test', url: popupUrl }

  assert.equal(
    await background.send({ type: { toString: null, valueOf: null } }, sender),
    undefined,
  )
  assert.equal(background.calls.length, 0)
})

test('confirms completed repeats explicitly and clears terminal records without deleting native history', async () => {
  const background = createBackground()
  const sender = { id: 'test', url: popupUrl }

  await background.send(request, sender)
  background.items.get(42)!.state = 'complete'
  assert.equal(
    JSON.stringify(await background.send(request, sender)),
    JSON.stringify({ ok: false, error: 'duplicateDownload' }),
  )
  assert.equal(
    JSON.stringify(await background.send({ ...request, force: true }, sender)),
    JSON.stringify({ ok: true, downloadId: 43 }),
  )
  assert.equal(
    JSON.stringify(
      await background.send({ type: 'clear-downloads', ids: [42, 43] }, sender),
    ),
    JSON.stringify({ ok: true, removed: 1 }),
  )
  assert.equal(background.items.size, 2)
})
