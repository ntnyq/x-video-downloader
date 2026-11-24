import { isString } from '@ntnyq/utils'
import { MAX_CACHED_POSTS } from '../../constants/video'
import { isRecord } from '../isRecord'
import { isBroadcastId, isXUrl } from '../video/identity'
import { normalizePost } from '../video/posts'
import { normalizeReplayUrl } from './url'
import type { VideoPost } from '../../types/video'

/**
 * A replay assembled from captured broadcast metadata and its playback source.
 */
export interface BroadcastReplay {
  /**
   * Normalized display metadata with the owning broadcast identifier.
   */
  post: VideoPost & { broadcastId: string }
  /**
   * Validated HTTPS playlist URL from the replay media host.
   */
  playlist: string
}

/**
 * Checks whether X reports that a broadcast has finished.
 *
 * @param state - State from X's broadcast metadata.
 * @returns Whether the state allows a replay.
 */
export function isFinishedBroadcast(state: unknown): boolean {
  return (
    isString(state)
    && ['ended', 'timedout', 'canceled'].includes(state.toLowerCase())
  )
}

/**
 * Identifies a live stream status request by its path.
 *
 * @param pathname - Pathname from an observed X API request.
 * @returns The request's media key, or undefined for another endpoint.
 */
export function getBroadcastMediaKey(pathname: string): string | undefined {
  return pathname.match(
    /\/live_video_stream\/status\/(\d{1,3}_\d{1,25})(?:\.json)?$/,
  )?.[1]
}

/**
 * Validates a captured replay before it crosses an extension message boundary.
 *
 * @param value - Untrusted replay payload containing a post and playlist URL.
 * @returns The normalized replay, or undefined when either part is invalid.
 */
export function normalizeBroadcastReplay(
  value: unknown,
): BroadcastReplay | undefined {
  if (!isRecord(value)) {
    return
  }

  const post = normalizePost(value['post'])
  const playlist = normalizeReplayUrl(value['playlist'], 'playlist')

  if (post?.broadcastId && playlist) {
    return {
      post: { ...post, broadcastId: post.broadcastId },
      playlist,
    }
  }
}

/**
 * Refreshes a cache entry and evicts the oldest entry when the cache is full.
 *
 * @template T - Type of the values stored in the cache.
 * @param cache - Insertion-ordered cache to update.
 * @param key - Identifier of the entry to update or insert.
 * @param value - Latest value for the entry.
 */
function upsertCacheEntry<T>(cache: Map<string, T>, key: string, value: T) {
  cache.delete(key)
  cache.set(key, value)

  const oldest = cache.keys().next().value

  if (cache.size > MAX_CACHED_POSTS && oldest) {
    cache.delete(oldest)
  }
}

/**
 * Pairs passively observed broadcast metadata and playlist responses by media key in either arrival order.
 *
 * @param publish - Callback that receives validated replays with both parts available.
 * @returns Methods for observing responses and publishing cached replays again.
 */
export function createBroadcastCapture(
  publish: (replay: BroadcastReplay) => void,
) {
  const broadcasts = new Map<
    string,
    { mediaKey: string; post: BroadcastReplay['post'] }
  >()
  const playlists = new Map<string, string>()

  function publishReplay(broadcast: {
    mediaKey: string
    post: BroadcastReplay['post']
  }) {
    const playlist = playlists.get(broadcast.mediaKey)

    if (playlist) {
      publish({ post: broadcast.post, playlist })
    }
  }

  function recordBroadcast(value: unknown, fallbackId?: string) {
    if (!isRecord(value)) {
      return
    }

    const broadcastId = value['broadcast_id'] ?? value['id'] ?? fallbackId
    const mediaKey = value['media_key']
    const state = value['state']

    if (
      !isBroadcastId(broadcastId)
      || !isString(mediaKey)
      || !/^\d{1,3}_\d{1,25}$/.test(mediaKey)
      || !isFinishedBroadcast(state)
      || value['available_for_replay'] !== true
    ) {
      return
    }

    const userResults = value['user_results']
    const user = isRecord(userResults) ? userResults['result'] : undefined
    const core = isRecord(user) ? user['core'] : undefined
    const start = value['start_time']
    const post = normalizePost({
      id: `broadcast-${broadcastId}`,
      broadcastId,
      media: [],
      text: value['status'],
      author: isRecord(core) ? core['screen_name'] : value['username'],
      createdAt:
        typeof start === 'number' && start > 0 && start <= 8.64e15
          ? new Date(start).toISOString()
          : undefined,
    })

    if (post) {
      const broadcast = { mediaKey, post: { ...post, broadcastId } }

      upsertCacheEntry(broadcasts, broadcastId, broadcast)
      publishReplay(broadcast)
    }
  }

  function handleResponse(url: string, payload: unknown) {
    if (!isXUrl(url) || !isRecord(payload)) {
      return
    }

    const { pathname } = new URL(url)
    const mediaKey = getBroadcastMediaKey(pathname)

    if (mediaKey) {
      const source = payload['source']

      if (!isRecord(source) || source['streamType'] === 'live') {
        return
      }

      const playlist =
        normalizeReplayUrl(source['noRedirectPlaybackUrl'], 'playlist')
        ?? normalizeReplayUrl(source['location'], 'playlist')

      if (playlist) {
        upsertCacheEntry(playlists, mediaKey, playlist)

        for (const broadcast of broadcasts.values()) {
          if (broadcast.mediaKey === mediaKey) {
            publishReplay(broadcast)
          }
        }
      }

      return
    }

    if (/\/graphql\/[^/]+\/BroadcastQuery$/.test(pathname)) {
      const data = payload['data']

      if (isRecord(data)) {
        recordBroadcast(data['broadcast_by_rest_id'] ?? data['broadcast'])
      }
    } else if (/\/broadcasts\/show(?:\.json)?$/.test(pathname)) {
      const items = payload['broadcasts']

      if (isRecord(items)) {
        for (const [id, item] of Object.entries(items).slice(
          0,
          MAX_CACHED_POSTS,
        )) {
          recordBroadcast(item, id)
        }
      }
    }
  }

  function republishCachedReplays() {
    for (const broadcast of broadcasts.values()) {
      publishReplay(broadcast)
    }
  }

  return {
    handleResponse,
    republishCachedReplays,
  }
}
