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
type Sender = { id: string; url: string; tab?: object }
type Listener = (
  message: unknown,
  sender: Sender,
  respond: (value: unknown) => void,
) => unknown

function createBackground(shouldFail = false) {
  const calls: unknown[] = []
  let listener: Listener | undefined
  const browser = {
    runtime: {
      id: 'test',
      getURL: () => popupUrl,
      onMessage: {
        addListener(callback: Listener) {
          listener = callback
        },
      },
      onInstalled: { addListener() {} },
    },
    commands: { onCommand: { addListener() {} } },
    downloads: {
      search: async () => [],
      cancel: async () => {},
      async download(options: unknown) {
        calls.push(options)
        if (shouldFail) {
          throw new Error('USER_CANCELED')
        }
        return 42
      },
    },
  }
  const exports: { default?: () => void } = {}
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
    require(id: string) {
      if (id === '#imports') {
        return { browser, defineBackground: (main: unknown) => main }
      }
      if (id === '~/utils/download') {
        return download
      }
      if (id === '~/utils/video') {
        return video
      }
      if (id === '~/utils/settings') {
        return {
          async getDownloadPreferences() {
            return {
              saveAs: false,
              filenameTemplate: 'X-{postId}-{index}',
            }
          },
          downloadRecords: {
            getValue: async () => [],
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
