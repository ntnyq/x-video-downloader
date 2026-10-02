import { shallowRef } from 'vue'
import { MAX_CACHED_POSTS, VIDEO_CHANNEL } from '~/constants/video'
import {
  getPostId,
  isRecord,
  normalizePost,
  normalizeVariants,
} from '~/utils/video'
import type { ContentScriptContext } from '#imports'
import type { PageVideos, VideoPost } from '~/types/video'

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
  if (analytics && getPostId(analytics.href)) {
    return getPostId(analytics.href)
  }
  for (const time of article.querySelectorAll('time')) {
    if (time.closest('[data-testid="quoteTweet"], [role="link"]')) {
      continue
    }
    const permalink = time.closest('a[href]')
    if (permalink instanceof HTMLAnchorElement) {
      return getPostId(permalink.href)
    }
  }
  for (const link of article.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/status/"]',
  )) {
    if (/\/(?:photo|video)\/\d+$/.test(new URL(link.href).pathname)) {
      return getPostId(link.href)
    }
  }
}

/**
 * Creates a bounded video cache and a reactive snapshot for the current page.
 * Capture messages, replay requests, DOM scans, and teardown share the supplied context.
 *
 * @param ctx - WXT context controlling page events and resource invalidation.
 * @returns The snapshot and operations for observing, scanning, and requesting captured posts.
 */
export function createPageVideos(ctx: ContentScriptContext) {
  const cache = new Map<string, VideoPost>()
  const snapshot = shallowRef<PageVideos>({ posts: [], captureReady: false })
  let scanTimer: number | undefined
  /**
   * Provides a no-op scan observer until a consumer subscribes.
   */
  let onScan = () => {}

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
   */
  function scan() {
    cancelScan()
    if (ctx.isInvalid) {
      return
    }
    const visibleIds = new Set<string>()
    const currentPostId = getPostId(location.href)
    if (currentPostId) {
      visibleIds.add(currentPostId)
    }

    for (const article of document.querySelectorAll('article')) {
      const postId = getArticlePostId(article)
      if (postId) {
        visibleIds.add(postId)
      }
      // Include quoted posts with explicit permalinks without assigning their
      // media to the outer post.
      for (const link of article.querySelectorAll<HTMLAnchorElement>(
        'a[href*="/status/"]',
      )) {
        const linkedId = getPostId(link.href)
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
      const linkedIds = new Set(
        [...article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]')]
          .map(link => getPostId(link.href))
          .filter(Boolean),
      )
      if (linkedIds.size > 1) {
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
            ].map(url => ({ url })),
          )
          return variants.length
            ? [{ id: `dom-${index}`, variants, hasHls: false }]
            : []
        },
      )
      if (media.length) {
        remember({
          id: postId,
          text:
            article.querySelector('[data-testid="tweetText"]')?.textContent
            ?? '',
          media,
        })
      }
    }
    const posts = [...visibleIds].flatMap(id => cache.get(id) ?? [])
    const next = {
      posts,
      currentPostId,
      captureReady: snapshot.value.captureReady,
    }
    if (JSON.stringify(next) !== JSON.stringify(snapshot.value)) {
      snapshot.value = next
    }
    onScan()
  }

  /**
   * Schedules one debounced DOM scan while the content-script context remains valid.
   */
  function scheduleScan() {
    if (scanTimer === undefined && ctx.isValid) {
      // One page-lifetime cleanup replaces WXT's per-timeout registrations.
      scanTimer = window.setTimeout(scan, 120)
    }
  }

  /**
   * Requests cached posts from the capture script and schedules a page scan.
   */
  function requestReplay() {
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
      if (post) {
        remember(post)
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
    ctx.onInvalidated(() => observer.disconnect())
    scan()
  }

  return { snapshot, observe, scan, requestReplay }
}
