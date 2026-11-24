import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { shallowRef } from 'vue'
import * as extensionContext from '../utils/extension/context'

interface UiOptions {
  /**
   * Shadow host name distinguishing the panel from per-post controls.
   */
  name: string
  /**
   * Native element targeted by this UI.
   */
  anchor: unknown
  /**
   * Placement relative to the native anchor.
   */
  append?: string
  /**
   * Events stopped at the shadow boundary.
   */
  isolateEvents: string[]
  /**
   * Vue mounting callback supplied by the real content script.
   */
  onMount: (container: { lang?: string }) => { unmount: () => void }
  /**
   * Vue teardown callback supplied by the real content script.
   */
  onRemove?: (app: { unmount: () => void } | undefined) => void
}

/**
 * Executes the actual content entrypoint with a native-action-row and storage fixture.
 */
async function createContent(useNewUi = false, deferFirstControl = false) {
  const attached = new Set<unknown>()
  const rendered: string[] = []
  const created: { options: UiOptions; mounted: boolean; removed: boolean }[] =
    []
  const invalidation = new Set<() => void>()
  const gate = Promise.withResolvers<void>()
  let deferred = deferFirstControl
  let actions = {}
  let postId = '123'
  let scan = () => {}
  let extensionId: string | undefined = 'test'
  let changeSetting = (_value: boolean) => {}
  const article = {
    isConnected: true,
    querySelector(selector: string) {
      if (selector.startsWith('[data-testid="reply"]')) {
        return {
          closest: () => actions,
        }
      }

      if (selector === 'x-video-download-button') {
        return attached.size ? {} : null
      }

      return {}
    },
  }
  const ctx = {
    isInvalid: false,
    addEventListener() {},
    onInvalidated(callback: () => void) {
      invalidation.add(callback)

      return () => invalidation.delete(callback)
    },
  }
  const exports: {
    default?: { main: (context: typeof ctx) => Promise<void> }
  } = {}

  runInNewContext(
    ts.transpileModule(
      readFileSync(
        new URL('../entrypoints/content/index.ts', import.meta.url),
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
      exports,
      document: {
        body: {},
        querySelectorAll: () => (article.isConnected ? [article] : []),
      },
      window: {},
      i18n: { t: (key: string) => key },
      require(id: string) {
        if (id === 'vue') {
          return {
            shallowRef,
            h(component: string) {
              rendered.push(component)

              return {}
            },
            createApp(options: { render: () => unknown }) {
              return {
                mount: () => options.render(),
                unmount() {},
              }
            },
          }
        }

        if (id === '#imports') {
          return {
            defineContentScript: (definition: unknown) => definition,
            browser: {
              runtime: {
                get id() {
                  return extensionId
                },
                onMessage: {
                  addListener() {},
                  removeListener() {
                    if (!extensionId) {
                      throw new Error('Extension context invalidated.')
                    }
                  },
                },
              },
            },
          }
        }

        if (id === '~/constants/video') {
          return {
            X_MATCHES: [],
          }
        }

        if (id === '~/utils/extension/context') {
          return extensionContext
        }

        if (id === '~/utils/logger') {
          return {
            logger: {
              withTag() {
                return {
                  warn() {},
                }
              },
            },
          }
        }

        if (id === '~/utils/isRecord') {
          return {
            isRecord: () => false,
          }
        }

        if (id === '~/utils/storage/downloadPreferences') {
          return {
            newUiSetting: {
              getValue: async () => useNewUi,
              watch(callback: (value: boolean) => void) {
                changeSetting = callback

                return () => {
                  if (!extensionId) {
                    throw new Error('Extension context invalidated.')
                  }

                  changeSetting = () => {}
                }
              },
            },
          }
        }

        if (id === './pageVideos') {
          return {
            createPageVideos() {
              return {
                snapshot: shallowRef({ posts: [] }),
                getArticleVideoId: () => postId,
                requestReplay() {},
                scan: () => scan(),
                observe(callback: () => void) {
                  scan = callback
                  scan()
                },
              }
            },
          }
        }

        if (id === './shadowUi') {
          return {
            async createDisposableShadowRootUi(
              _context: unknown,
              options: UiOptions,
            ) {
              const record = { options, mounted: false, removed: false }

              created.push(record)

              if (options.name === 'x-video-download-button' && deferred) {
                deferred = false
                await gate.promise
              }

              let app: { unmount: () => void } | undefined
              const ui = {
                shadowHost: { style: {} },
                mount() {
                  record.mounted = true

                  if (options.name === 'x-video-download-button') {
                    attached.add(ui)
                  }

                  app = options.onMount({})
                },
                remove() {
                  record.removed = true
                  attached.delete(ui)
                  options.onRemove?.(app)
                },
              }

              ctx.onInvalidated(ui.remove)

              return ui
            },
          }
        }

        if (id.endsWith('.vue')) {
          return {
            __esModule: true,
            default: id,
          }
        }

        if (id.endsWith('.css')) {
          return {}
        }

        throw new Error(id)
      },
    },
  )
  assert.ok(exports.default)
  await exports.default.main(ctx)
  await setImmediate()

  return {
    created,
    rendered,
    attached,
    get actions() {
      return actions
    },
    changeUi: (value: boolean) => changeSetting(value),
    releaseControl: () => gate.resolve(),
    replacePost(id: string) {
      postId = id
      scan()
    },
    replaceActions() {
      actions = {}
      scan()
    },
    stop(extensionReloaded = false) {
      ctx.isInvalid = true

      if (extensionReloaded) {
        extensionId = undefined
      }

      for (const callback of invalidation) {
        callback()
      }
    },
  }
}

test('reloading the extension detaches its old panel even after the runtime goes away', async () => {
  const content = await createContent()

  assert.doesNotThrow(() => content.stop(true))
  assert.equal(content.created[0]?.removed, true)
  assert.equal(content.attached.size, 0)
})

test('the legacy post control stays below the native action row by default', async t => {
  const content = await createContent()

  t.after(() => content.stop())
  const control = content.created[1]

  assert.equal(control?.options.anchor, content.actions)
  assert.equal(control?.options.append, 'after')
  assert.ok(
    content.rendered.includes('~/components/video/InlineDownloadButton.vue'),
  )
})

test('the opted-in icon is appended inside the action row and isolates double-clicks', async t => {
  const content = await createContent(true)

  t.after(() => content.stop())
  const control = content.created[1]

  assert.equal(control?.options.anchor, content.actions)
  assert.equal(control?.options.append, 'last')
  assert.ok(control?.options.isolateEvents.includes('dblclick'))
  assert.ok(
    content.rendered.includes('~/components/video/ToolbarDownloadButton.vue'),
  )
})

test('changing the setting remounts exactly one control and replaced action rows get a new anchor', async t => {
  const content = await createContent()

  t.after(() => content.stop())
  content.changeUi(true)
  await setImmediate()
  assert.equal(content.created[1]?.removed, true)
  assert.equal(content.created[2]?.options.append, 'last')
  assert.equal(content.attached.size, 1)
  content.replaceActions()
  await setImmediate()
  assert.equal(content.created[2]?.removed, true)
  assert.equal(content.created[3]?.options.anchor, content.actions)
  content.changeUi(false)
  await setImmediate()
  assert.equal(content.created[4]?.options.append, 'after')
  assert.equal(content.attached.size, 1)
})

test('an old pending mount is discarded when the UI setting changes', async t => {
  const content = await createContent(false, true)

  t.after(() => content.stop())
  assert.equal(content.attached.size, 0)
  content.changeUi(true)
  content.releaseControl()
  await setImmediate()
  assert.equal(content.created[1]?.mounted, false)
  assert.equal(content.created[1]?.removed, true)
  assert.equal(content.created[2]?.options.append, 'last')
  assert.equal(content.attached.size, 1)
})

test('mounts the new post control when a pending article is recycled', async t => {
  const content = await createContent(false, true)

  t.after(() => content.stop())
  content.replacePost('456')
  assert.equal(content.created.length, 2)
  content.releaseControl()
  await setImmediate()
  assert.equal(content.created[1]?.mounted, false)
  assert.equal(content.created[1]?.removed, true)
  assert.equal(content.created[2]?.mounted, true)
  assert.equal(content.attached.size, 1)
})
