import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as vue from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'
import * as requests from '../utils/download/requests'
import * as variants from '../utils/video/variants'
import type { DownloadRequest, VideoPost } from '../types/video'

const post: VideoPost = {
  id: '123',
  text: 'Video post',
  media: [
    {
      id: '1',
      hasHls: false,
      variants: [
        {
          url: 'https://video.twimg.com/low.mp4',
          bitrate: 1000,
          width: 640,
          height: 360,
        },
        {
          url: 'https://video.twimg.com/high.mp4',
          bitrate: 4000,
          width: 1920,
          height: 1080,
        },
      ],
    },
  ],
}

/**
 * Creates a trusted pointer or keyboard activation without a browser DOM.
 */
function click(detail = 1, isTrusted = true) {
  const event: Partial<MouseEvent> = { detail, isTrusted }

  return event as MouseEvent
}

/**
 * Runs the real toolbar component with controllable single-click timing and batch downloads.
 */
function createButton(value: VideoPost | undefined = post) {
  const calls: DownloadRequest[][] = []
  const events: string[] = []
  const props = vue.shallowReactive({ post: value })
  const isPending = vue.shallowRef(false)
  const scope = vue.effectScope()
  let timer: (() => void) | undefined
  let confirmations = 0
  const { descriptor } = parse(
    readFileSync(
      new URL('../components/video/ToolbarDownloadButton.vue', import.meta.url),
      'utf8',
    ),
  )
  const exports: {
    default?: {
      setup: (
        props: { post?: VideoPost },
        context: { emit: (event: string) => void; expose: () => void },
      ) => {
        handleClick: (event: MouseEvent) => void
        handleDoubleClick: (event: MouseEvent) => Promise<void>
        confirmDuplicate: (event: MouseEvent) => Promise<void> | undefined
      }
    }
  } = {}

  runInNewContext(
    ts.transpileModule(
      compileScript(descriptor, { id: 'toolbar-test' }).content,
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
      require(id: string) {
        if (id === 'vue') {
          return vue
        }

        if (id === '#i18n') {
          return {
            i18n: { t: (key: string) => key },
          }
        }

        if (id === '~/utils/download/requests') {
          return requests
        }

        if (id === '~/utils/video/variants') {
          return variants
        }

        if (id === '~/composables/usePageTheme') {
          return {
            usePageTheme: () => vue.shallowRef('light'),
          }
        }

        if (id === '~/composables/useTheme') {
          return {
            useTheme() {
              return {
                themeStyle: vue.shallowRef({}),
              }
            },
          }
        }

        if (id === '@vueuse/core') {
          return {
            useTimeoutFn(callback: () => void) {
              vue.onScopeDispose(() => {
                timer = undefined
              })

              return {
                start() {
                  timer = callback
                },
                stop() {
                  timer = undefined
                },
              }
            },
          }
        }

        if (id === '~/composables/usePostDownloads') {
          return {
            usePostDownloads() {
              return {
                isPending,
                requestError: vue.shallowRef(''),
                duplicateRequests: vue.shallowRef([]),
                async submitDownloadRequests(requests: DownloadRequest[]) {
                  calls.push(structuredClone(requests))
                },
                async confirmDuplicates() {
                  confirmations++
                },
                dismissDuplicates() {},
              }
            },
          }
        }

        if (id.endsWith('.vue')) {
          return {}
        }

        throw new Error(id)
      },
    },
  )
  assert.ok(exports.default)
  const component = exports.default
  const state = scope.run(() =>
    component.setup(props, { emit: event => events.push(event), expose() {} }),
  )

  assert.ok(state)

  return {
    props,
    state,
    calls,
    events,
    scope,
    isPending,
    get confirmations() {
      return confirmations
    },
    flushClick() {
      const callback = timer

      timer = undefined
      callback?.()
    },
  }
}

test('a toolbar single-click opens the panel without starting a download', t => {
  const button = createButton()

  t.after(() => button.scope.stop())
  button.state.handleClick(click())
  assert.deepEqual(button.events, [])
  button.flushClick()
  assert.deepEqual(button.events, ['open'])
  assert.deepEqual(button.calls, [])
})

test('a double-click cancels the single-click and downloads the highest version once', async t => {
  const button = createButton()

  t.after(() => button.scope.stop())
  button.state.handleClick(click(1))
  button.state.handleClick(click(2))
  await button.state.handleDoubleClick(click(2))
  button.flushClick()
  assert.deepEqual(button.events, [])
  assert.equal(button.calls.length, 1)
  assert.equal(button.calls[0]?.[0]?.url, 'https://video.twimg.com/high.mp4')
})

test('double-click downloads each available video while retaining original media positions', async t => {
  const button = createButton({
    ...post,
    media: [
      { id: 'hls', hasHls: true, variants: [] },
      ...post.media,
      ...post.media,
    ],
  })

  t.after(() => button.scope.stop())
  await button.state.handleDoubleClick(click(2))
  assert.deepEqual(
    button.calls[0]?.map(request => request.mediaIndex),
    [2, 3],
  )
  assert.ok(
    button.calls[0]?.every(
      request => request.url === 'https://video.twimg.com/high.mp4',
    ),
  )
})

test('keyboard activation opens the panel immediately', t => {
  const button = createButton()

  t.after(() => button.scope.stop())
  button.state.handleClick(click(0))
  assert.deepEqual(button.events, ['open'])
  button.flushClick()
  assert.equal(button.events.length, 1)
})

test('untrusted or pending toolbar interactions do not open or download', async t => {
  const button = createButton()

  t.after(() => button.scope.stop())
  button.state.handleClick(click(1, false))
  await button.state.handleDoubleClick(click(2, false))
  button.isPending.value = true
  button.state.handleClick(click())
  await button.state.handleDoubleClick(click(2))
  button.flushClick()
  assert.deepEqual(button.events, [])
  assert.deepEqual(button.calls, [])
})

test('post changes and teardown cancel a delayed panel opening', t => {
  const button = createButton()

  t.after(() => button.scope.stop())
  button.state.handleClick(click())
  button.props.post = { ...post, id: '456' }
  button.flushClick()
  assert.deepEqual(button.events, [])
  button.state.handleClick(click())
  button.scope.stop()
  button.flushClick()
  assert.deepEqual(button.events, [])
})

test('missing MP4 data opens detection and duplicate downloads still require a trusted confirmation', async t => {
  const button = createButton({ ...post, media: [] })

  t.after(() => button.scope.stop())
  await button.state.handleDoubleClick(click(2))
  assert.deepEqual(button.events, ['open'])
  assert.deepEqual(button.calls, [])
  await button.state.confirmDuplicate(click(1, false))
  assert.equal(button.confirmations, 0)
  await button.state.confirmDuplicate(click())
  assert.equal(button.confirmations, 1)
})
