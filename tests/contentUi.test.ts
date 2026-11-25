import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { shallowRef } from 'vue'
import { DEFAULT_DOWNLOAD_BUTTON_POSITION } from '../constants/preferences'
import { normalizeDownloadButtonPosition } from '../utils/download/preferences'
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
   * Host styling applied outside the component's shadow root.
   */
  css?: string
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
async function createContent(
  useNewUi = false,
  deferFirstControl = false,
  position: unknown = 'actionRow',
) {
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
  let changePosition = (_value: unknown) => {}
  const headerRow = { style: { display: 'flex', flexDirection: 'row' } }
  let menu: ReturnType<typeof createMenu> | undefined
  const article = {
    isConnected: true,
    querySelectorAll() {
      return [createMenu(true), ...(menu ? [menu] : [])]
    },
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

  /**
   * Models More controls inside column wrappers, including a quoted-post decoy.
   */
  function createMenu(isQuoted = false) {
    const control = {
      parentElement: {
        parentElement: headerRow,
        style: { display: 'flex', flexDirection: 'column' },
      },
      closest(selector: string): unknown {
        if (selector === 'article') {
          return article
        }

        if (selector === 'button, [role="button"]') {
          return control
        }

        return isQuoted ? {} : null
      },
    }

    return control
  }

  menu = createMenu()
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
      getComputedStyle: (element: { style: unknown }) => element.style,
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

        if (id === '~/constants/preferences') {
          return {
            DEFAULT_DOWNLOAD_BUTTON_POSITION,
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
            downloadButtonPositionSetting: {
              getValue: async () => position,
              watch(callback: (value: unknown) => void) {
                changePosition = callback

                return () => {
                  changePosition = () => {}
                }
              },
            },
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

        if (id === '~/utils/download/preferences') {
          return {
            normalizeDownloadButtonPosition,
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
    get menuAnchor() {
      return menu?.parentElement
    },
    changePosition: (value: unknown) => changePosition(value),
    replaceMenu(isPresent = true) {
      menu = isPresent ? createMenu() : undefined
      scan()
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

test('the header option places the icon before the owning More wrapper with space and isolated double-clicks', async t => {
  const content = await createContent(true, false, 'postHeader')

  t.after(() => content.stop())
  const control = content.created[1]

  assert.equal(control?.options.anchor, content.menuAnchor)
  assert.equal(control?.options.append, 'before')
  assert.match(control?.options.css ?? '', /margin-inline-end: 8px/)
  assert.ok(control?.options.isolateEvents.includes('dblclick'))
  assert.ok(
    content.rendered.includes('~/components/video/ToolbarDownloadButton.vue'),
  )
})

test('switching icon positions moves exactly one control and preserves the choice across legacy mode', async t => {
  const content = await createContent(true)

  t.after(() => content.stop())

  content.changePosition('postHeader')
  await setImmediate()
  assert.equal(content.created[1]?.removed, true)
  assert.equal(content.created[2]?.options.anchor, content.menuAnchor)
  assert.equal(content.attached.size, 1)

  content.changeUi(false)
  await setImmediate()
  assert.equal(content.created[3]?.options.anchor, content.actions)
  assert.equal(content.created[3]?.options.append, 'after')

  content.changeUi(true)
  await setImmediate()
  assert.equal(content.created[4]?.options.anchor, content.menuAnchor)
  assert.equal(content.attached.size, 1)

  content.changePosition('invalid')
  await setImmediate()
  assert.equal(content.created[5]?.options.anchor, content.actions)
  assert.equal(content.created[5]?.options.append, 'last')
})

test('replaced or missing More controls remount without targeting quoted menus', async t => {
  const content = await createContent(true, false, 'postHeader')

  t.after(() => content.stop())

  content.replaceMenu()
  await setImmediate()
  assert.equal(content.created[1]?.removed, true)
  assert.equal(content.created[2]?.options.anchor, content.menuAnchor)

  content.replaceMenu(false)
  await setImmediate()
  assert.equal(content.created[3]?.options.anchor, content.actions)
  assert.equal(content.created[3]?.options.append, 'last')

  content.replaceMenu()
  await setImmediate()
  assert.equal(content.created[4]?.options.anchor, content.menuAnchor)
  assert.equal(content.attached.size, 1)
})

test('a position change discards an older pending mount', async t => {
  const content = await createContent(true, true)

  t.after(() => content.stop())

  content.changePosition('postHeader')
  content.releaseControl()
  await setImmediate()
  assert.equal(content.created[1]?.mounted, false)
  assert.equal(content.created[1]?.removed, true)
  assert.equal(content.created[2]?.options.anchor, content.menuAnchor)
  assert.equal(content.attached.size, 1)
})
