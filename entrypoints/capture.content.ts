/* eslint-disable unicorn/no-this-outside-of-class -- Preserve native fetch/XHR receivers. */
import { safeParse } from '@ntnyq/utils'
import { defineContentScript } from '#imports'
import { MAX_CACHED_POSTS, VIDEO_CHANNEL, X_MATCHES } from '~/constants/video'
import { extractVideoPosts, isRecord, isXUrl } from '~/utils/video'
import type { VideoPost } from '~/types/video'

export default defineContentScript({
  matches: X_MATCHES,
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    const posts = new Map<string, VideoPost>()
    const xhrUrls = new WeakMap<XMLHttpRequest, string>()

    function isPostResponse(input: string) {
      try {
        const url = new URL(input, location.href)
        return (
          isXUrl(url.href)
          && /\/(?:i\/api|1\.1|2)\//.test(url.pathname)
          && !/direct_messages|\/dm\//i.test(url.pathname)
        )
      } catch {
        return false
      }
    }

    function publish(payload: unknown) {
      for (const post of extractVideoPosts(payload)) {
        posts.delete(post.id)
        posts.set(post.id, post)
        if (posts.size > MAX_CACHED_POSTS) {
          const oldestId = posts.keys().next().value
          if (oldestId) {
            posts.delete(oldestId)
          }
        }
        window.postMessage(
          { channel: VIDEO_CHANNEL, type: 'post', post },
          location.origin,
        )
      }
    }

    const originalFetch = window.fetch
    window.fetch = function (...args) {
      const promise = Reflect.apply(originalFetch, this, args)
      const input = args[0]
      const url = input instanceof Request ? input.url : String(input)
      if (isPostResponse(url)) {
        promise
          .then(async response => {
            if (
              !response.ok
              || !response.headers.get('content-type')?.includes('json')
            ) {
              return
            }
            publish(await response.clone().json())
          })
          .catch(() => {
            // Best-effort capture must never alter the page's requests.
          })
      }
      return promise
    }

    const originalOpen = XMLHttpRequest.prototype.open
    const originalSend = XMLHttpRequest.prototype.send
    XMLHttpRequest.prototype.open = function (
      method,
      url,
      ...rest: [
        async?: boolean,
        username?: string | null,
        password?: string | null,
      ]
    ) {
      xhrUrls.set(this, String(url))
      return Reflect.apply(originalOpen, this, [method, url, ...rest])
    }
    XMLHttpRequest.prototype.send = function (...args) {
      if (isPostResponse(xhrUrls.get(this) ?? '')) {
        this.addEventListener(
          'load',
          () => {
            try {
              if (this.status < 200 || this.status >= 300) {
                return
              }
              if (this.responseType === 'json') {
                publish(this.response)
              } else if (
                (!this.responseType || this.responseType === 'text')
                && this.getResponseHeader('content-type')?.includes('json')
              ) {
                const result = safeParse(this.responseText)
                if (result.success) {
                  publish(result.value)
                }
              }
            } catch {
              // Non-JSON and unsupported responses are intentionally ignored.
            }
          },
          { once: true },
        )
      }
      return Reflect.apply(originalSend, this, args)
    }

    let lastReplay = 0
    window.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (
        event.source !== window
        || event.origin !== location.origin
        || !isRecord(event.data)
        || event.data['channel'] !== VIDEO_CHANNEL
        || event.data['type'] !== 'ready'
        || Date.now() - lastReplay < 300
      ) {
        return
      }
      lastReplay = Date.now()
      window.postMessage(
        { channel: VIDEO_CHANNEL, type: 'capture-ready' },
        location.origin,
      )
      for (const post of posts.values()) {
        window.postMessage(
          { channel: VIDEO_CHANNEL, type: 'post', post },
          location.origin,
        )
      }
    })
    window.postMessage(
      { channel: VIDEO_CHANNEL, type: 'capture-ready' },
      location.origin,
    )
  },
})
