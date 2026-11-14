import '~/assets/tailwind.css'
import { createApp, h, shallowRef } from 'vue'
import { browser, defineContentScript } from '#imports'
import InlineDownloadButton from '~/components/video/InlineDownloadButton.vue'
import ToolbarDownloadButton from '~/components/video/ToolbarDownloadButton.vue'
import { X_MATCHES } from '~/constants/video'
import { logger } from '~/utils/logger'
import { newUiSetting } from '~/utils/settings'
import { isRecord } from '~/utils/video'
import App from './App.vue'
import { createPageVideos, getArticlePostId } from './pageVideos'
import { createDisposableShadowRootUi } from './shadowUi'
import type { ContentScriptContext } from '#imports'

const log = logger.withTag('content')

export default defineContentScript({
  matches: X_MATCHES,
  runAt: 'document_start',
  cssInjectionMode: 'ui',
  /**
   * Mounts the floating panel and maintains inline controls for captured page videos.
   * Message listeners and UI resources are tied to the content-script context lifetime.
   *
   * @param ctx - WXT context supplying invalidation and page event handling.
   * @returns A promise resolving after the panel and timeline observation are initialized.
   * @throws When the floating panel's shadow UI cannot be created.
   */
  async main(ctx) {
    const videos = createPageVideos(ctx)
    const isOpen = shallowRef(false)
    const selectedPostId = shallowRef<string>()
    const controls = new Map<
      Element,
      {
        /**
         * Post identifier currently associated with an article control.
         */
        id: string
        /**
         * Native action group, or article fallback, used when this control was mounted.
         */
        anchor: Element
        /**
         * Unmounts the inline control and releases its shadow-UI resources.
         */
        remove: () => void
      }
    >()
    const pending = new Set<Element>()
    let useNewUi = false
    let uiVersion = 0

    /**
     * Opens the floating panel and requests fresh captured video data.
     *
     * @param postId - Optional post identifier used to focus the panel on an inline selection.
     */
    function open(postId?: string) {
      selectedPostId.value = postId
      isOpen.value = true
      videos.requestReplay()
    }

    /**
     * Responds to this extension's requests for page videos or panel visibility changes.
     *
     * @param message - Untrusted runtime message to inspect.
     * @param sender - Browser-supplied identity of the sending extension context.
     * @param respond - Callback used to return a snapshot or acknowledge a panel toggle.
     */
    const listener: Parameters<
      typeof browser.runtime.onMessage.addListener
    >[0] = (message: unknown, sender, respond) => {
      if (sender.id !== browser.runtime.id || !isRecord(message)) {
        return
      }

      if (message['type'] === 'get-page-videos') {
        videos.scan()
        videos.requestReplay()
        respond(videos.snapshot.value)
      } else if (message['type'] === 'toggle-panel') {
        if (isOpen.value) {
          isOpen.value = false
        } else {
          open()
        }

        respond({ ok: true })
      }
    }

    browser.runtime.onMessage.addListener(listener)
    ctx.onInvalidated(() => browser.runtime.onMessage.removeListener(listener))

    await waitForBody(ctx)

    if (ctx.isInvalid) {
      return
    }

    const ui = await createDisposableShadowRootUi(ctx, {
      name: 'x-video-downloader',
      position: 'inline',
      anchor: document.body,
      isolateEvents: ['keydown', 'keyup', 'keypress', 'click'],
      /**
       * Mounts the floating panel application inside its localized shadow container.
       *
       * @param container - Element provided by the shadow UI for the Vue application.
       * @returns The mounted Vue application for later teardown.
       */
      onMount(container) {
        container.lang = i18n.t('extension.language')
        const app = createApp({
          /**
           * Renders the floating panel with current capture, visibility, and selection state.
           *
           * @returns The panel virtual node with its event handlers.
           */
          render() {
            return h(App, {
              snapshot: videos.snapshot.value,
              isOpen: isOpen.value,
              selectedPostId: selectedPostId.value,
              /**
               * Opens the floating panel without applying a post filter.
               */
              onOpen: () => open(),
              /**
               * Closes the floating panel while keeping its captured data available.
               */
              onClose() {
                isOpen.value = false
              },
              /**
               * Clears the inline-post selection so the panel displays all captured posts.
               */
              onShowAll() {
                selectedPostId.value = undefined
              },
              onRefresh: videos.requestReplay,
            })
          },
        })

        app.mount(container)

        return app
      },
      /**
       * Unmounts the Vue application when its shadow UI is removed.
       *
       * @param app - Mounted application, if mounting completed successfully.
       */
      onRemove: app => app?.unmount(),
    })

    if (ctx.isInvalid) {
      ui.remove()

      return
    }

    ui.mount()

    let hasUiSettingChanged = false
    const stopUiSetting = newUiSetting.watch(value => {
      hasUiSettingChanged = true
      const nextUi = value === true

      if (nextUi === useNewUi || ctx.isInvalid) {
        return
      }

      useNewUi = nextUi
      uiVersion++

      for (const control of controls.values()) {
        control.remove()
      }

      controls.clear()
      videos.scan()
    })

    ctx.onInvalidated(stopUiSetting)

    try {
      const value = await newUiSetting.getValue()

      if (!hasUiSettingChanged) {
        useNewUi = value === true
      }
    } catch (error) {
      log.warn('Could not read the post UI setting', error)
    }

    if (ctx.isInvalid) {
      return
    }

    /**
     * Finds the native post action row used as the download control's anchor.
     */
    function getActions(article: Element) {
      return article
        .querySelector(
          '[data-testid="reply"], [data-testid="retweet"], [data-testid="like"]',
        )
        ?.closest('[role="group"]')
    }

    /**
     * Creates at most one pending inline control for an article and verifies it before mounting.
     * Detached or repurposed articles discard the control; failures are logged and cleaned up.
     *
     * @param article - Timeline article that should receive the download control.
     * @param postId - Post identifier associated with the article when mounting begins.
     * @returns A promise resolving after the mount attempt and pending-state cleanup.
     */
    async function mountButton(article: Element, postId: string) {
      if (pending.has(article)) {
        return
      }

      pending.add(article)
      const version = uiVersion
      let removeButton: (() => void) | undefined
      let hasAnchorChanged = false

      try {
        const actions = getActions(article)
        const isToolbar = useNewUi && !!actions
        const button = await createDisposableShadowRootUi(ctx, {
          name: 'x-video-download-button',
          position: 'inline',
          anchor: actions ?? article,
          append: isToolbar ? 'last' : actions ? 'after' : 'last',
          isolateEvents: ['click', 'dblclick', 'keydown', 'keyup', 'keypress'],
          // WXT resets the host with `all: initial !important`; keep the icon a fixed flex item.
          css: useNewUi
            ? ':host { display: inline-flex !important; align-items: center !important; flex-shrink: 0 !important; } body { background: transparent; }'
            : undefined,
          /**
           * Mounts an inline download button inside its localized shadow container.
           *
           * @param container - Element provided by the shadow UI beside the post actions.
           * @returns The mounted Vue application for later teardown.
           */
          onMount(container) {
            container.lang = i18n.t('extension.language')
            const app = createApp({
              /**
               * Renders the inline button using the latest captured data for its post.
               *
               * @returns The inline-button virtual node with its panel-opening handler.
               */
              render() {
                return h(
                  useNewUi ? ToolbarDownloadButton : InlineDownloadButton,
                  {
                    post: videos.snapshot.value.posts.find(
                      post => post.id === postId,
                    ),
                    /**
                     * Opens the panel for this post when captured data exists, or shows all videos otherwise.
                     */
                    onOpen() {
                      return open(
                        videos.snapshot.value.posts.some(
                          post => post.id === postId,
                        )
                          ? postId
                          : undefined,
                      )
                    },
                  },
                )
              },
            })

            app.mount(container)

            return app
          },
          /**
           * Unmounts the Vue application when its shadow UI is removed.
           *
           * @param app - Mounted application, if mounting completed successfully.
           */
          onRemove: app => app?.unmount(),
        })

        removeButton = () => button.remove()
        hasAnchorChanged = getActions(article) !== actions

        if (
          ctx.isInvalid
          || version !== uiVersion
          || hasAnchorChanged
          || !article.isConnected
          || getArticlePostId(article) !== postId
        ) {
          removeButton()

          return
        }

        button.mount()
        controls.set(article, {
          id: postId,
          anchor: actions ?? article,
          remove: removeButton,
        })
      } catch (error) {
        removeButton?.()
        log.warn('Could not mount an inline button', error)
      } finally {
        pending.delete(article)

        if ((version !== uiVersion || hasAnchorChanged) && !ctx.isInvalid) {
          videos.scan()
        }
      }
    }

    videos.observe(() => {
      for (const [article, control] of controls) {
        if (
          !article.isConnected
          || getArticlePostId(article) !== control.id
          || control.anchor !== (getActions(article) ?? article)
          || !article.querySelector('x-video-download-button')
        ) {
          control.remove()
          controls.delete(article)
        }
      }

      for (const article of document.querySelectorAll('article')) {
        if (controls.has(article)) {
          continue
        }

        const postId = getArticlePostId(article)

        if (!postId) {
          continue
        }

        if (
          article.querySelector('video, [data-testid="videoPlayer"]')
          || videos.snapshot.value.posts.some(post => post.id === postId)
        ) {
          mountButton(article, postId)
        }
      }
    })
    ctx.addEventListener(window, 'wxt:locationchange', () => {
      selectedPostId.value = undefined
    })
    ctx.onInvalidated(() => {
      // Each UI removes itself through its own invalidation callback.
      controls.clear()
    })
  },
})

/**
 * Waits for the document body while allowing context invalidation to release the wait.
 *
 * @param ctx - Content-script context controlling event registration and invalidation.
 * @returns A promise resolving when the body is available or the context is invalidated.
 */
async function waitForBody(ctx: ContentScriptContext) {
  if (document.body) {
    return
  }

  await new Promise<void>(resolve => {
    ctx.addEventListener(document, 'DOMContentLoaded', () => resolve(), {
      once: true,
    })
    ctx.onInvalidated(resolve)
  })
}
