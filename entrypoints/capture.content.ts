/* eslint-disable unicorn/no-this-outside-of-class -- Preserve native fetch/XHR receivers. */
import { safeParse } from '@ntnyq/utils'
import { defineContentScript } from '#imports'
import {
  CAPTURE_REPLAY_INTERVAL_MS,
  MAX_CACHED_POSTS,
  VIDEO_CHANNEL,
  X_MATCHES,
} from '~/constants/video'
import { isRecord } from '~/utils/isRecord'
import {
  createBroadcastCapture,
  getBroadcastMediaKey,
} from '~/utils/replay/broadcast'
import { isXUrl } from '~/utils/video/identity'
import { extractVideoPosts } from '~/utils/video/posts'
import type { VideoPost } from '~/types/video'

interface XhrRequest {
  /**
   * URL associated with one successful open call.
   */
  url: string
  /**
   * Releases the response observers installed by send.
   */
  cleanup?: () => void
}

export default defineContentScript({
  matches: X_MATCHES,
  runAt: 'document_start',
  world: 'MAIN',
  /**
   * Installs page-world response observers and announces readiness to the isolated script.
   * Native fetch promises and XHR receivers are preserved while capture remains best-effort.
   */
  main() {
    const posts = new Map<string, VideoPost>()
    const broadcasts = createBroadcastCapture(replay => {
      window.postMessage(
        { channel: VIDEO_CHANNEL, type: 'broadcast-replay', replay },
        location.origin,
      )
    })
    const xhrRequests = new WeakMap<XMLHttpRequest, XhrRequest>()

    /**
     * Checks that a request targets an X/Twitter API endpoint outside direct messages.
     *
     * @param input - Absolute or page-relative request URL.
     * @returns Whether the response is eligible for public post-video extraction.
     */
    function isPostResponse(input: string) {
      try {
        const url = new URL(input, location.href)
        const path = decodeURIComponent(url.pathname)

        return (
          isXUrl(url.href)
          && (/^\/(?:i\/api|1\.1|2)\//.test(path)
            || (url.hostname === 'api.x.com'
              && /^\/graphql\/[^/]+\/BroadcastQuery$/.test(path)))
          && !/direct[_-]?messages|\/dm(?:\/|$)|\/graphql\/[^/]+\/dm/i.test(
            path,
          )
        )
      } catch {
        return false
      }
    }

    /**
     * Allows playback status responses that omit their JSON content type.
     *
     * @param input - URL of an eligible X API request.
     * @param contentType - Content-Type header supplied by the response.
     * @returns Whether the response can be parsed as JSON.
     */
    function isJsonResponse(input: string, contentType: string | null) {
      if (contentType !== null) {
        return contentType.includes('json')
      }

      const url = new URL(input, location.href)

      return Boolean(getBroadcastMediaKey(url.pathname))
    }

    /**
     * Extracts response videos, updates the bounded replay cache, and posts them to the page.
     *
     * @param url - URL of the observed X request.
     * @param payload - Parsed JSON response body from an eligible fetch or XHR request.
     */
    function publish(url: string, payload: unknown) {
      broadcasts.handleResponse(new URL(url, location.href).href, payload)

      for (const post of extractVideoPosts(payload)) {
        const previous = posts.get(post.id)

        if (previous) {
          post.media = post.media.length ? post.media : previous.media

          if (previous.relatedBroadcastId) {
            post.relatedBroadcastId ??= previous.relatedBroadcastId
          }
        }

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

    /**
     * Observes eligible JSON responses without replacing the native fetch promise.
     *
     * @param args - Request input and options forwarded unchanged to native fetch.
     * @returns The original fetch promise, including its native rejection behavior.
     * @throws When the native fetch invocation throws synchronously.
     */
    window.fetch = function (...args) {
      const promise = Reflect.apply(originalFetch, this, args)
      const input = args[0]
      const url = input instanceof Request ? input.url : String(input)

      if (isPostResponse(url)) {
        promise
          .then(async response => {
            const responseUrl = response.url || url

            if (
              !response.ok
              || !isPostResponse(responseUrl)
              || !isJsonResponse(
                responseUrl,
                response.headers.get('content-type'),
              )
            ) {
              return
            }

            publish(responseUrl, await response.clone().json())
          })
          .catch(() => {
            // Best-effort capture must never alter the page's requests.
          })
      }

      return promise
    }

    const originalOpen = XMLHttpRequest.prototype.open
    const originalSend = XMLHttpRequest.prototype.send

    /**
     * Records the request URL while preserving the native XHR receiver and arguments.
     *
     * @param method - HTTP method passed to the native open operation.
     * @param url - Request URL retained for response eligibility checks.
     * @param rest - Remaining native open arguments forwarded without modification.
     * @throws When the native open operation rejects its arguments or current state.
     */
    XMLHttpRequest.prototype.open = function (
      method,
      url,
      ...rest: [
        async?: boolean,
        username?: string | null,
        password?: string | null,
      ]
    ) {
      const previous = xhrRequests.get(this)
      const request: XhrRequest = { url: String(url) }

      // Native open can synchronously dispatch readystatechange, whose handler
      // may call send before open returns.
      xhrRequests.set(this, request)

      try {
        const result = Reflect.apply(originalOpen, this, [method, url, ...rest])

        previous?.cleanup?.()

        return result
      } catch (error) {
        request.cleanup?.()

        if (xhrRequests.get(this) === request) {
          if (previous) {
            xhrRequests.set(this, previous)
          } else {
            xhrRequests.delete(this)
          }
        }

        throw error
      }
    }
    /**
     * Observes an eligible XHR response after load without changing native sending.
     *
     * @param args - Native send arguments, including the optional request body.
     * @throws When the native send operation fails for the current request state.
     */
    XMLHttpRequest.prototype.send = function (...args) {
      const request = xhrRequests.get(this)

      if (!request || !isPostResponse(request.url) || request.cleanup) {
        // A second send may throw while the original request is still pending.
        // Preserve that request's observer and the native exception.
        return Reflect.apply(originalSend, this, args)
      }

      /**
       * Releases observers after completion, failure, reopening, or a failed send.
       */
      const url = request.url
      const cleanup = () => {
        this.removeEventListener('load', onLoad)
        this.removeEventListener('loadend', cleanup)

        if (request.cleanup === cleanup) {
          request.cleanup = undefined
        }
      }

      /**
       * Publishes only the response belonging to this observed request.
       */
      function onLoad(this: XMLHttpRequest) {
        cleanup()

        if (xhrRequests.get(this) !== request) {
          return
        }

        try {
          const responseUrl = this.responseURL || url

          if (
            this.status < 200
            || this.status >= 300
            || !isPostResponse(responseUrl)
          ) {
            return
          }

          if (this.responseType === 'json') {
            publish(responseUrl, this.response)
          } else if (
            (!this.responseType || this.responseType === 'text')
            && isJsonResponse(
              responseUrl,
              this.getResponseHeader('content-type'),
            )
          ) {
            const result = safeParse(this.responseText)

            if (result.success) {
              publish(responseUrl, result.value)
            }
          }
        } catch {
          // Non-JSON and unsupported responses are intentionally ignored.
        }
      }

      request.cleanup = cleanup
      this.addEventListener('load', onLoad, { once: true })
      this.addEventListener('loadend', cleanup, { once: true })

      try {
        return Reflect.apply(originalSend, this, args)
      } catch (error) {
        cleanup()

        throw error
      }
    }

    let lastReplay = 0

    window.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (
        event.source !== window
        || event.origin !== location.origin
        || !isRecord(event.data)
        || event.data['channel'] !== VIDEO_CHANNEL
        || event.data['type'] !== 'ready'
        || Date.now() - lastReplay < CAPTURE_REPLAY_INTERVAL_MS
      ) {
        return
      }

      lastReplay = Date.now()
      window.postMessage(
        { channel: VIDEO_CHANNEL, type: 'capture-ready' },
        location.origin,
      )

      broadcasts.republishCachedReplays()

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
