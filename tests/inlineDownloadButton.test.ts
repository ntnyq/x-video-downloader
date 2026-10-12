import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as vue from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'
import { normalizePreferences } from '../utils/preferences'
import * as preferences from '../utils/preferences'
import type { DownloadRequest, VideoPost } from '../types/video'

const post: VideoPost = {
  id: '123',
  text: 'A video',
  media: [
    {
      id: 'video-1',
      hasHls: false,
      variants: [
        {
          url: 'https://video.twimg.com/video.mp4',
          bitrate: 1000,
          width: 1280,
          height: 720,
        },
      ],
    },
  ],
}
const click: Partial<MouseEvent> = { isTrusted: true }
const trustedClick = click as MouseEvent

/**
 * Runs the actual inline component setup with controlled download responses.
 */
function createButton(value: VideoPost | undefined = post) {
  const calls: { request: DownloadRequest; force?: boolean }[] = []
  const events: string[] = []
  const duplicateRequest = vue.shallowRef<DownloadRequest>()
  const isPending = vue.shallowRef(false)
  const scope = vue.effectScope()
  const { descriptor } = parse(
    readFileSync(
      new URL('../components/video/InlineDownloadButton.vue', import.meta.url),
      'utf8',
    ),
  )
  const exports: {
    default?: {
      setup: (
        props: { post?: VideoPost },
        context: { emit: (event: string) => void; expose: () => void },
      ) => {
        handleQuick: (event: MouseEvent) => Promise<void>
        confirmDuplicate: (event: MouseEvent) => Promise<void>
      }
    }
  } = {}
  runInNewContext(
    ts.transpileModule(
      compileScript(descriptor, { id: 'inline-test' }).content,
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
        if (id === '~/utils/preferences') {
          return preferences
        }
        if (id === '~/composables/useDownloadPreferences') {
          return {
            useDownloadPreferences() {
              return {
                preferences: vue.shallowRef(normalizePreferences({})),
                isReady: vue.shallowRef(true),
                preferenceError: vue.shallowRef(''),
              }
            },
          }
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
        if (id === '~/composables/useVideoDownload') {
          return {
            useVideoDownload() {
              return {
                isPending,
                duplicateRequest,
                message: vue.shallowRef(''),
                hasError: vue.shallowRef(false),
                async download(request: DownloadRequest, force?: boolean) {
                  calls.push({ request, force })
                  return true
                },
              }
            },
          }
        }
        if (id.endsWith('.vue') || id === '~/components/ui/button') {
          return {}
        }
        throw new Error(id)
      },
    },
  )
  const component = exports.default
  assert.ok(component)
  const state = scope.run(() =>
    component.setup(
      { post: value },
      { emit: event => events.push(event), expose() {} },
    ),
  )
  assert.ok(state)
  return {
    state,
    scope,
    calls,
    events,
    duplicateRequest,
    isPending,
  }
}

test('a successful quick download queues the video without opening the panel', async t => {
  const button = createButton()
  t.after(() => button.scope.stop())
  await button.state.handleQuick(trustedClick)
  assert.equal(button.calls.length, 1)
  assert.equal(button.calls[0]?.request.url, post.media[0]?.variants[0]?.url)
  assert.equal(button.calls[0]?.request.postId, post.id)
  assert.deepEqual(button.events, [])
})

test('confirming a duplicate queues a forced download without opening the panel', async t => {
  const button = createButton()
  t.after(() => button.scope.stop())
  const request: DownloadRequest = {
    type: 'download-video',
    postId: post.id,
    mediaIndex: 1,
    url: 'https://video.twimg.com/video.mp4',
  }
  button.duplicateRequest.value = request
  await button.state.confirmDuplicate(trustedClick)
  assert.deepEqual(button.calls, [{ request, force: true }])
  assert.deepEqual(button.events, [])
})

test('quick download still opens selection when a post has multiple videos', async t => {
  const button = createButton({
    ...post,
    media: [...post.media, ...post.media],
  })
  t.after(() => button.scope.stop())
  await button.state.handleQuick(trustedClick)
  assert.deepEqual(button.calls, [])
  assert.deepEqual(button.events, ['open'])
})

test('untrusted or pending quick-download clicks do not queue or open anything', async t => {
  const button = createButton()
  t.after(() => button.scope.stop())
  await button.state.handleQuick({ isTrusted: false } as MouseEvent)
  button.isPending.value = true
  await button.state.handleQuick(trustedClick)
  assert.deepEqual(button.calls, [])
  assert.deepEqual(button.events, [])
})
