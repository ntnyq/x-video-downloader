import '@unocss/reset/tailwind.css'
import 'uno.css'
import { createApp, h, shallowRef } from 'vue'
import { browser, createShadowRootUi, defineContentScript } from '#imports'
import InlineDownloadButton from '~/components/video/InlineDownloadButton.vue'
import { X_MATCHES } from '~/constants/video'
import { isRecord } from '~/utils/video'
import App from './App.vue'
import { createPageVideos, getArticlePostId } from './pageVideos'
import type { ContentScriptContext } from '#imports'

export default defineContentScript({
  matches: X_MATCHES,
  runAt: 'document_start',
  cssInjectionMode: 'ui',
  async main(ctx) {
    const videos = createPageVideos(ctx)
    const isOpen = shallowRef(false)
    const selectedPostId = shallowRef<string>()
    const controls = new Map<Element, { id: string; remove: () => void }>()
    const pending = new Set<Element>()

    function open(postId?: string) {
      selectedPostId.value = postId
      isOpen.value = true
      videos.requestReplay()
    }

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
    const ui = await createShadowRootUi(ctx, {
      name: 'x-video-downloader',
      position: 'inline',
      anchor: document.body,
      isolateEvents: ['keydown', 'keyup', 'keypress', 'click'],
      onMount(container) {
        container.lang = i18n.t('uiLanguage')
        const app = createApp({
          render() {
            return h(App, {
              snapshot: videos.snapshot.value,
              isOpen: isOpen.value,
              selectedPostId: selectedPostId.value,
              onOpen: () => open(),
              onClose() {
                isOpen.value = false
              },
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
      onRemove: app => app?.unmount(),
    })
    if (ctx.isInvalid) {
      return
    }
    ui.mount()

    async function mountButton(article: Element, postId: string) {
      if (pending.has(article)) {
        return
      }
      pending.add(article)
      try {
        const actions = article
          .querySelector(
            '[data-testid="reply"], [data-testid="retweet"], [data-testid="like"]',
          )
          ?.closest('[role="group"]')
        const button = await createShadowRootUi(ctx, {
          name: 'x-video-download-button',
          position: 'inline',
          anchor: actions ?? article,
          append: actions ? 'after' : 'last',
          isolateEvents: ['click', 'keydown', 'keyup', 'keypress'],
          onMount(container) {
            container.lang = i18n.t('uiLanguage')
            const app = createApp({
              render() {
                return h(InlineDownloadButton, {
                  post: videos.snapshot.value.posts.find(
                    post => post.id === postId,
                  ),
                  onOpen() {
                    return open(
                      videos.snapshot.value.posts.some(
                        post => post.id === postId,
                      )
                        ? postId
                        : undefined,
                    )
                  },
                })
              },
            })
            app.mount(container)
            return app
          },
          onRemove: app => app?.unmount(),
        })
        if (
          ctx.isInvalid
          || !article.isConnected
          || getArticlePostId(article) !== postId
        ) {
          return
        }
        button.mount()
        controls.set(article, { id: postId, remove: () => button.remove() })
      } catch (error) {
        console.warn(
          '[X Video Downloader] Could not mount an inline button',
          error,
        )
      } finally {
        pending.delete(article)
      }
    }

    videos.observe(() => {
      for (const [article, control] of controls) {
        if (
          !article.isConnected
          || getArticlePostId(article) !== control.id
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
      ui.remove()
      for (const control of controls.values()) {
        control.remove()
      }
      controls.clear()
    })
  },
})

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
