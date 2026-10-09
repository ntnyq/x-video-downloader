import assert from 'node:assert/strict'
import { getEventListeners } from 'node:events'
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

/**
 * Executes the page capture script with mocked fetch, XHR, and message channels.
 *
 * @param response - Native response that the fetch stub should resolve with.
 * @returns The simulated page APIs, captured messages, replay listeners, and XHR class.
 * @throws When the entrypoint cannot be loaded or imports an unexpected module.
 */
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
    autoComplete = true
    sendError?: Error
    openError?: Error
    /**
     * Supplies a JSON content type for the XHR response fixture.
     *
     * @returns The application/json MIME type.
     */
    getResponseHeader() {
      return 'application/json'
    }
    /**
     * Records arguments passed through the capture script's XHR open wrapper.
     *
     * @param args - Native open arguments supplied by the test.
     */
    open(...args: unknown[]) {
      if (this.openError) {
        throw this.openError
      }
      this.openArgs = args
      this.dispatchEvent(new Event('readystatechange'))
    }
    /**
     * Synchronously emits the load event to exercise XHR response capture.
     */
    send() {
      if (this.sendError) {
        throw this.sendError
      }
      if (this.autoComplete) {
        this.dispatchEvent(new Event('load'))
        this.dispatchEvent(new Event('loadend'))
      }
    }
  }
  const window = {
    /**
     * Returns the original promise so tests can check that capture preserves its identity.
     *
     * @returns The promise resolving to the supplied response.
     */
    fetch: () => promise,
    /**
     * Records messages published by the capture script.
     *
     * @param message - Payload posted to the simulated page channel.
     * @returns The number of recorded messages after appending the payload.
     */
    postMessage: (message: unknown) => messages.push(message),
    /**
     * Collects replay listeners for explicit delivery by the test.
     *
     * @param _type - Event name accepted but unused by this message-only stub.
     * @param listener - Callback registered by the capture entrypoint.
     * @returns The number of registered replay listeners.
     */
    addEventListener(_type: string, listener: (event: unknown) => void) {
      return listeners.push(listener)
    },
  }
  const exports: {
    /**
     * Content-script definition exported by the transpiled capture entrypoint.
     */
    default?: {
      /**
       * Capture initializer invoked in the simulated page environment.
       */
      main: () => void
    }
  } = {}
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
    /**
     * Resolves capture dependencies to the actual parsing helpers and a WXT stub.
     *
     * @param id - Module identifier requested by the transpiled capture script.
     * @returns The corresponding fixture or application module.
     * @throws When the script imports an unexpected module.
     */
    require(id: string) {
      if (id === '@ntnyq/utils') {
        return { safeParse }
      }
      if (id === '#imports') {
        return {
          /**
           * Preserves the content-script definition for explicit initialization.
           *
           * @param definition - Definition supplied by the capture entrypoint.
           * @returns The unchanged content-script definition.
           */
          defineContentScript: (definition: unknown) => definition,
        }
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

for (const termination of ['abort', 'error', 'timeout']) {
  test(`releases observers after ${termination} and ignores an excluded response on XHR reuse`, () => {
    const harness = createHarness(Response.json(payload))
    const xhr = new harness.MockXhr()
    xhr.autoComplete = false
    xhr.open('GET', 'https://x.com/i/api/graphql/hash/TweetDetail')
    xhr.send()
    xhr.dispatchEvent(new Event(termination))
    xhr.dispatchEvent(new Event('loadend'))
    assert.equal(getEventListeners(xhr, 'load').length, 0)
    assert.equal(getEventListeners(xhr, 'loadend').length, 0)

    xhr.autoComplete = true
    xhr.open('GET', 'https://x.com/i/api/1.1/dm/inbox_initial_state.json')
    xhr.send()
    assert.equal(harness.messages.length, 1, 'only capture-ready is published')

    xhr.open('GET', 'https://x.com/i/api/graphql/hash/TweetDetail')
    xhr.send()
    assert.equal(
      harness.messages.length,
      2,
      'a later eligible response is captured',
    )
    assert.equal(getEventListeners(xhr, 'load').length, 0)
    assert.equal(getEventListeners(xhr, 'loadend').length, 0)
  })
}

test('reopening a pending XHR replaces its observer even without a terminal event', () => {
  const harness = createHarness(Response.json(payload))
  const xhr = new harness.MockXhr()
  xhr.autoComplete = false
  xhr.open('GET', 'https://x.com/i/api/graphql/hash/TweetDetail')
  xhr.send()
  xhr.open('GET', 'https://other.test/i/api/graphql/hash/TweetDetail')
  assert.equal(getEventListeners(xhr, 'load').length, 0)
  assert.equal(getEventListeners(xhr, 'loadend').length, 0)
  xhr.autoComplete = true
  xhr.send()
  assert.equal(harness.messages.length, 1)

  xhr.autoComplete = false
  for (let index = 0; index < 3; index++) {
    xhr.open('GET', 'https://x.com/i/api/graphql/hash/TweetDetail')
    xhr.send()
  }
  xhr.dispatchEvent(new Event('load'))
  xhr.dispatchEvent(new Event('loadend'))
  assert.equal(harness.messages.length, 2, 'the replacement is captured once')
})

test('a synchronous send failure preserves its error and leaves no stale capture observer', () => {
  const harness = createHarness(Response.json(payload))
  const xhr = new harness.MockXhr()
  const error = new Error('send failed')
  xhr.open('GET', 'https://x.com/i/api/graphql/hash/TweetDetail')
  xhr.sendError = error
  assert.throws(
    () => xhr.send(),
    candidate => candidate === error,
  )
  assert.equal(getEventListeners(xhr, 'load').length, 0)
  assert.equal(getEventListeners(xhr, 'loadend').length, 0)

  xhr.sendError = undefined
  xhr.send()
  assert.equal(
    harness.messages.length,
    2,
    'retrying send captures exactly once',
  )
})

test('a rejected second send preserves capture of the already pending request', () => {
  const harness = createHarness(Response.json(payload))
  const xhr = new harness.MockXhr()
  xhr.autoComplete = false
  xhr.open('GET', 'https://x.com/i/api/graphql/hash/TweetDetail')
  xhr.send()
  const error = new Error('request already sent')
  xhr.sendError = error
  assert.throws(
    () => xhr.send(),
    candidate => candidate === error,
  )
  xhr.dispatchEvent(new Event('load'))
  xhr.dispatchEvent(new Event('loadend'))
  assert.equal(
    harness.messages.length,
    2,
    'the pending request is captured once',
  )
  assert.equal(getEventListeners(xhr, 'load').length, 0)
  assert.equal(getEventListeners(xhr, 'loadend').length, 0)
})

test('a rejected open preserves the pending request identity and native error', () => {
  const harness = createHarness(Response.json(payload))
  const xhr = new harness.MockXhr()
  xhr.autoComplete = false
  xhr.open('GET', 'https://x.com/i/api/graphql/hash/TweetDetail')
  xhr.send()
  const error = new Error('invalid URL')
  xhr.openError = error
  assert.throws(
    () => xhr.open('GET', 'invalid URL'),
    candidate => candidate === error,
  )
  xhr.dispatchEvent(new Event('load'))
  xhr.dispatchEvent(new Event('loadend'))
  assert.equal(harness.messages.length, 2)
})

test('send inside the synchronous open event uses the new request eligibility', () => {
  const harness = createHarness(Response.json(payload))
  const xhr = new harness.MockXhr()
  xhr.addEventListener('readystatechange', () => xhr.send())
  xhr.open('GET', 'https://x.com/i/api/graphql/hash/TweetDetail')
  assert.equal(harness.messages.length, 2, 'the eligible response is captured')
  xhr.open('GET', 'https://x.com/i/api/1.1/dm/inbox_initial_state.json')
  assert.equal(harness.messages.length, 2, 'the excluded response is ignored')
  assert.equal(getEventListeners(xhr, 'load').length, 0)
  assert.equal(getEventListeners(xhr, 'loadend').length, 0)
})
