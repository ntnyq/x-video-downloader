import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { runInNewContext } from 'node:vm'
import { safeParse } from '@ntnyq/utils'
import ts from 'typescript'
import * as constants from '../constants/video'
import * as video from '../utils/video'

const mediaUrl =
  'https://video.twimg.com/ext_tw_video/1/pu/vid/1280x720/sample.mp4'
const payload = {
  rest_id: '2105974296740811141',
  legacy: {
    extended_entities: {
      media: [
        {
          id_str: '1',
          type: 'video',
          video_info: { variants: [{ url: mediaUrl }] },
        },
      ],
    },
  },
}

function createHarness(response: Response) {
  const messages: unknown[] = []
  const listeners: Array<(event: unknown) => void> = []
  const promise = Promise.resolve(response)
  class MockXhr extends EventTarget {
    status = 200
    responseType = 'json'
    response = payload
    responseText = JSON.stringify(payload)
    openArgs: unknown[] = []
    getResponseHeader() {
      return 'application/json'
    }
    open(...args: unknown[]) {
      this.openArgs = args
    }
    send() {
      this.dispatchEvent(new Event('load'))
    }
  }
  const window = {
    fetch: () => promise,
    postMessage: (message: unknown) => messages.push(message),
    addEventListener(_type: string, listener: (event: unknown) => void) {
      return listeners.push(listener)
    },
  }
  const exports: { default?: { main: () => void } } = {}
  const source = readFileSync(
    new URL('../entrypoints/capture.content.ts', import.meta.url),
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
    window,
    URL,
    Request,
    XMLHttpRequest: MockXhr,
    location: { href: 'https://x.com/home', origin: 'https://x.com' },
    require(id: string) {
      if (id === '@ntnyq/utils') {
        return { safeParse }
      }
      if (id === '#imports') {
        return { defineContentScript: (definition: unknown) => definition }
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
  exports.default?.main()
  return { window, messages, listeners, promise, MockXhr }
}

test('boots independently, preserves fetch promise and leaves response readable', async () => {
  const response = Response.json(payload)
  const harness = createHarness(response)
  const fetch = harness.window.fetch as (url: string) => Promise<Response>
  assert.equal(
    fetch('https://x.com/i/api/graphql/hash/TweetDetail'),
    harness.promise,
  )
  await setImmediate()
  await setImmediate()
  assert.equal(
    video.isRecord(harness.messages[0]) && harness.messages[0]['type'],
    'capture-ready',
  )
  assert.equal(
    harness.messages.some(
      message => video.isRecord(message) && message['type'] === 'post',
    ),
    true,
  )
  assert.deepEqual(await response.json(), payload)
})

test('replays cached videos when the isolated script starts later', async () => {
  const harness = createHarness(Response.json(payload))
  const xhr = new harness.MockXhr()
  xhr.open('GET', 'https://x.com/i/api/graphql/hash/TweetDetail')
  xhr.send()
  harness.messages.length = 0
  harness.listeners[0]?.({
    source: harness.window,
    origin: 'https://x.com',
    data: { channel: constants.VIDEO_CHANNEL, type: 'ready' },
  })
  assert.equal(
    harness.messages.filter(
      message => video.isRecord(message) && message['type'] === 'post',
    ).length,
    1,
  )
  assert.deepEqual(xhr.openArgs, [
    'GET',
    'https://x.com/i/api/graphql/hash/TweetDetail',
  ])
})

test('captures text JSON while ignoring malformed and non-object XHR payloads', () => {
  const harness = createHarness(Response.json(payload))
  for (const responseText of [
    JSON.stringify(payload),
    '{broken',
    'null',
    '42',
  ]) {
    const xhr = new harness.MockXhr()
    xhr.responseType = 'text'
    xhr.responseText = responseText
    xhr.open('GET', 'https://x.com/i/api/graphql/hash/TweetDetail')
    xhr.send()
    assert.equal(xhr.responseText, responseText)
  }
  const posts = harness.messages.filter(
    message => video.isRecord(message) && message['type'] === 'post',
  )
  assert.equal(posts.length, 1)
})

test('ignores unrelated requests, direct messages and cross-origin replay messages', async () => {
  const harness = createHarness(Response.json(payload))
  const fetch = harness.window.fetch as (url: string) => Promise<Response>
  await fetch('https://other.test/i/api/graphql/hash/TweetDetail')
  await fetch('https://x.com/i/api/1.1/dm/inbox_initial_state.json')
  await setImmediate()
  assert.equal(harness.messages.length, 1)
  harness.listeners[0]?.({
    source: harness.window,
    origin: 'https://evil.test',
    data: { channel: constants.VIDEO_CHANNEL, type: 'ready' },
  })
  assert.equal(harness.messages.length, 1)
})
