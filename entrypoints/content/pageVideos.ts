import { filterFalsy, isUndefined, noop, unique } from '@ntnyq/utils'
import { shallowRef } from 'vue'
import { MAX_CACHED_POSTS, VIDEO_CHANNEL } from '~/constants/video'
import { isRecord } from '~/utils/isRecord'
import {
  isFinishedBroadcast,
  normalizeBroadcastReplay,
} from '~/utils/replay/broadcast'
import { normalizeReplayUrl } from '~/utils/replay/url'
import {
  extractBroadcastIdFromUrl,
  extractPostIdFromUrl,
  isBroadcastId,
} from '~/utils/video/identity'
import { normalizePost } from '~/utils/video/posts'
import { normalizeVariants } from '~/utils/video/variants'
import type { ContentScriptContext } from '#imports'
import type { PageVideos, VideoPost } from '~/types/video'
import type { BroadcastReplay } from '~/utils/replay/broadcast'

/**
 * Resolves an article's own post ID from analytics, timestamp, or media permalinks.
 * Quoted-post timestamp links are excluded when selecting the owning post.
 *
 * @param article - Timeline article whose owning post should be identified.
 * @returns The post identifier, or undefined when no supported permalink is found.
 */
export function getArticlePostId(article: Element): string | undefined {
  const analytics = article.querySelector<HTMLAnchorElement>(
    '[role="group"] a[href*="/analytics"]',
  )

  const analyticsId = extractPostIdFromUrl(analytics?.href)

  if (analyticsId) {
    return analyticsId
  }

  for (const time of article.querySelectorAll('time')) {
    if (time.closest('[data-testid="quoteTweet"], [role="link"]')) {
      continue
    }

    const permalink = time.closest<HTMLAnchorElement>('a[href]')
    const postId = extractPostIdFromUrl(permalink?.href)

    if (postId) {
      return postId
    }
  }

  for (const link of article.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/status/"]',
  )) {
    const postId = extractPostIdFromUrl(link.href)

    if (postId && /\/(?:photo|video)\/\d+$/.test(new URL(link.href).pathname)) {
      return postId
    }
  }
}

function getArticleBroadcastIds(article: Element) {
  return filterFalsy(
    [
      ...article.querySelectorAll<HTMLAnchorElement>(
        'a[href*="/i/broadcasts/"]',
      ),
    ].map(link => extractBroadcastIdFromUrl(link.href)),
  )
}

/**
 * Reads the HLS source X embeds in a standalone broadcast page before playback.
 *
 * @param broadcastId - Broadcast ID from the current page URL.
 * @returns The replay when the embedded metadata matches the current broadcast.
 */
function getPageBroadcastReplay(broadcastId: string) {
  const content = (selector: string) =>
    document.head?.querySelector<HTMLMetaElement>(`meta[${selector}]`)?.content

  if (
    content('name="twitter:text:broadcast_id"') !== broadcastId
    || !isFinishedBroadcast(content('name="twitter:string:broadcast_state"'))
  ) {
    return
  }

  return normalizeBroadcastReplay({
    post: {
      id: `broadcast-${broadcastId}`,
      broadcastId,
      media: [],
      text: content('name="twitter:text:broadcast_title"'),
      author: content('name="twitter:text:broadcaster_username"'),
      createdAt: content('property="video:release_date"'),
    },
    playlist:
      normalizeReplayUrl(content('property="og:video:secure_url"'), 'playlist')
      ?? content('property="og:video:url"'),
  })
}

/**
 * Creates a bounded video cache and a reactive snapshot for the current page.
 * Capture messages, replay requests, DOM scans, and teardown share the supplied context.
 *
 * @param ctx - WXT context controlling page events and resource invalidation.
 * @returns The snapshot and operations for observing, scanning, and requesting captured posts.
 */
export function createPageVideos(ctx: ContentScriptContext) {
  const replays = new Map<string, BroadcastReplay>()
  const cache = new Map<string, VideoPost>()
  const snapshot = shallowRef<PageVideos>({ posts: [], captureReady: false })
  let scanTimer: number | undefined
  /**
   * Provides a no-op scan observer until a consumer subscribes.
   */
  let onScan = noop

  /**
   * Cancels the pending DOM scan and clears its scheduling marker.
   */
  function cancelScan() {
    window.clearTimeout(scanTimer)
    scanTimer = undefined
  }

  ctx.onInvalidated(cancelScan)

  /**
   * Refreshes a post's cache position and evicts the oldest entry when the cache is full.
   *
   * @param post - Normalized captured post or a direct-DOM fallback post.
   */
  function remember(post: VideoPost) {
    const previous = cache.get(post.id)

    if (previous) {
      post.media = post.media.length ? post.media : previous.media

      if (previous.relatedBroadcastId) {
        post.relatedBroadcastId ??= previous.relatedBroadcastId
      }
    }

    cache.delete(post.id)
    cache.set(post.id, post)

    if (cache.size > MAX_CACHED_POSTS) {
      const oldestId = cache.keys().next().value

      if (oldestId) {
        cache.delete(oldestId)
      }
    }
  }

  /**
   * Rebuilds the visible-post snapshot from captured data and safe direct-video fallbacks.
   * Pending scans are cancelled and invalidated contexts perform no further DOM work.
   *
   * @returns The replay found in the current page metadata, if available.
   */
  function scan() {
    cancelScan()

    if (ctx.isInvalid) {
      return
    }

    const visibleIds = new Set<string>()
    const broadcastId = extractBroadcastIdFromUrl(location.href)
    const currentPostId = broadcastId
      ? `broadcast-${broadcastId}`
      : extractPostIdFromUrl(location.href)
    const pageReplay = broadcastId
      ? getPageBroadcastReplay(broadcastId)
      : undefined

    if (currentPostId) {
      visibleIds.add(currentPostId)
    }

    for (const article of document.querySelectorAll('article')) {
      const postId = getArticlePostId(article)

      for (const id of getArticleBroadcastIds(article)) {
        visibleIds.add(`broadcast-${id}`)
      }

      if (postId) {
        visibleIds.add(postId)
      }

      // Include quoted posts with explicit permalinks without assigning their
      // media to the outer post.
      for (const link of article.querySelectorAll<HTMLAnchorElement>(
        'a[href*="/status/"]',
      )) {
        const linkedId = extractPostIdFromUrl(link.href)

        if (linkedId && cache.has(linkedId)) {
          visibleIds.add(linkedId)
        }
      }

      if (
        !postId
        || cache.get(postId)?.media.some(media => !media.id.startsWith('dom-'))
      ) {
        continue
      }

      // A direct source is a fallback only when the article has one post ID.
      const linkedIds = unique(
        filterFalsy(
          [
            ...article.querySelectorAll<HTMLAnchorElement>(
              'a[href*="/status/"]',
            ),
          ].map(link => extractPostIdFromUrl(link.href)),
        ),
      )

      if (linkedIds.length > 1) {
        continue
      }

      const media = [...article.querySelectorAll('video')].flatMap(
        (video, index) => {
          if (video.closest('[data-testid="quoteTweet"], [role="link"]')) {
            return []
          }

          const variants = normalizeVariants(
            [
              video.currentSrc,
              video.src,
              ...[...video.querySelectorAll('source')].map(
                source => source.src,
              ),
            ].map(url => ({
              url,
            })),
          )

          return variants.length
            ? [{ id: `dom-${index}`, variants, hasHls: false }]
            : []
        },
      )

      if (media.length) {
        const post = normalizePost({
          id: postId,
          text:
            article.querySelector('[data-testid="tweetText"]')?.textContent
            ?? '',
          media,
        })

        if (post) {
          remember(post)
        }
      }
    }

    for (const id of visibleIds) {
      const relatedId = cache.get(id)?.relatedBroadcastId

      if (relatedId) {
        visibleIds.add(`broadcast-${relatedId}`)
      }
    }

    const posts = [...visibleIds].flatMap(id => {
      const post =
        replays.get(id)?.post
        ?? (pageReplay?.post.id === id ? pageReplay.post : cache.get(id))

      return post && (post.media.length || post.broadcastId) ? [post] : []
    })
    const next = {
      posts,
      currentPostId,
      captureReady: snapshot.value.captureReady,
    }

    if (JSON.stringify(next) !== JSON.stringify(snapshot.value)) {
      snapshot.value = next
    }

    onScan()

    return pageReplay
  }

  /**
   * Schedules one debounced DOM scan while the content-script context remains valid.
   */
  function scheduleScan() {
    if (isUndefined(scanTimer) && ctx.isValid) {
      // One page-lifetime cleanup replaces WXT's per-timeout registrations.
      scanTimer = window.setTimeout(scan, 120)
    }
  }

  /**
   * Requests cached posts from the capture script and schedules a page scan.
   */
  function requestReplay() {
    if (ctx.isInvalid) {
      return
    }

    window.postMessage(
      { channel: VIDEO_CHANNEL, type: 'ready' },
      location.origin,
    )
    scheduleScan()
  }

  ctx.addEventListener(window, 'message', (event: MessageEvent<unknown>) => {
    if (
      event.source !== window
      || event.origin !== location.origin
      || !isRecord(event.data)
      || event.data['channel'] !== VIDEO_CHANNEL
    ) {
      return
    }

    if (event.data['type'] === 'capture-ready') {
      if (!snapshot.value.captureReady) {
        snapshot.value = { ...snapshot.value, captureReady: true }
        requestReplay()
      }
    } else if (event.data['type'] === 'post') {
      const post = normalizePost(event.data['post'])

      if (post && !post.broadcastId) {
        remember(post)
        scheduleScan()
      }
    } else if (event.data['type'] === 'broadcast-replay') {
      const replay = normalizeBroadcastReplay(event.data['replay'])

      if (replay) {
        replays.delete(replay.post.id)
        replays.set(replay.post.id, replay)

        const oldest = replays.keys().next().value

        if (replays.size > MAX_CACHED_POSTS && oldest) {
          replays.delete(oldest)
        }

        scheduleScan()
      }
    }
  })
  ctx.addEventListener(window, 'wxt:locationchange', requestReplay)
  ctx.addEventListener(document, 'loadedmetadata', scheduleScan, {
    capture: true,
  })
  requestReplay()

  /**
   * Observes timeline mutations and invokes the subscriber after each completed scan.
   * The mutation observer is disconnected when the content-script context is invalidated.
   *
   * @param callback - Subscriber notified after the visible-post snapshot has been refreshed.
   */
  function observe(callback: () => void) {
    onScan = callback
    const observer = new MutationObserver(scheduleScan)

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'href', 'poster'],
    })

    if (document.head) {
      observer.observe(document.head, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['content'],
      })
    }

    ctx.onInvalidated(() => observer.disconnect())
    scan()
  }

  function getArticleVideoId(article: Element) {
    const postId = getArticlePostId(article)

    if (postId && cache.get(postId)?.media.length) {
      return postId
    }

    const linked = postId ? cache.get(postId)?.relatedBroadcastId : undefined
    const candidates = linked
      ? [linked, ...getArticleBroadcastIds(article)]
      : getArticleBroadcastIds(article)
    const replay = candidates
      .map(id => `broadcast-${id}`)
      .find(id => replays.has(id))

    return replay ?? postId
  }

  function getReplay(broadcastId: unknown) {
    if (isBroadcastId(broadcastId)) {
      const pageReplay = scan()

      const id = `broadcast-${broadcastId}`

      if (snapshot.value.posts.some(post => post.id === id)) {
        return (
          replays.get(id)
          ?? (pageReplay?.post.id === id ? pageReplay : undefined)
        )
      }
    }
  }

  return {
    snapshot,
    getArticleVideoId,
    getReplay,
    observe,
    scan,
    requestReplay,
  }
}
