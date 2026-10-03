import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { createDownloadManager } from '../entrypoints/background/downloadManager'
import * as download from '../utils/download'
import * as video from '../utils/video'

const request = {
  type: 'download-video',
  postId: '2105974296740811141',
  mediaIndex: 2,
  url: 'https://video.twimg.com/ext_tw_video/1/pu/vid/1280x720/sample.mp4',
}
const popupUrl = 'chrome-extension://test/popup.html'
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

/**
 * Runs the background entrypoint against in-memory browser and storage adapters.
 *
 * @param shouldFail - Whether native download attempts should simulate user cancellation.
 * @returns Recorded download options and a helper for sending runtime messages.
 * @throws When the entrypoint cannot be loaded or requests an unexpected dependency.
 */
function createBackground(shouldFail = false) {
  const calls: unknown[] = []
  let listener: Listener | undefined
  const browser = {
    runtime: {
      id: 'test',
      /**
       * Returns the popup URL used by the sender-validation fixture.
       *
       * @returns The fixed test extension popup URL.
       */
      getURL: () => popupUrl,
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
         * Ignores installation listeners because installation is outside these message tests.
         */
        addListener() {},
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
      /**
       * Simulates the absence of previously recorded browser downloads.
       *
       * @returns A promise resolving to an empty native-download list.
       */
      search: async () => [],
      /**
       * Accepts cancellation without a native browser in this harness.
       *
       * @returns A resolved cancellation promise.
       */
      cancel: async () => {},
      /**
       * Records native download options and simulates browser acceptance or cancellation.
       *
       * @param options - Options passed to the mocked downloads API.
       * @returns The fixed browser download identifier 42.
       * @throws With USER_CANCELED when this harness is configured to reject downloads.
       */
      async download(options: unknown) {
        calls.push(options)
        if (shouldFail) {
          throw new Error('USER_CANCELED')
        }
        return 42
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
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  runInNewContext(compiled, {
    exports,
    Error,
    /**
     * Resolves the background entrypoint's dependencies to controlled test adapters.
     *
     * @param id - Module identifier requested by the transpiled entrypoint.
     * @returns The matching browser, storage, or application module.
     * @throws When the entrypoint imports an unexpected module.
     */
    require(id: string) {
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
      if (id === '~/utils/download') {
        return download
      }
      if (id === '~/utils/video') {
        return video
      }
      if (id === '~/utils/settings') {
        return {
          /**
           * Supplies deterministic filename and save-dialog preferences for assertions.
           *
           * @returns Preferences disabling save dialogs and using post ID and media index in filenames.
           */
          async getDownloadPreferences() {
            return {
              saveAs: false,
              filenameTemplate: 'X-{postId}-{index}',
            }
          },
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
        return { createDownloadManager }
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
    return new Promise<unknown>(resolve => listener?.(message, sender, resolve))
  }
  return { calls, send }
}

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
