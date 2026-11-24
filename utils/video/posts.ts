import { isArray, isString } from '@ntnyq/utils'
import {
  MAX_MEDIA_ID_LENGTH,
  MAX_POST_DATE_LENGTH,
  MAX_POST_MEDIA,
  MAX_POST_TEXT_LENGTH,
  MAX_RESPONSE_NODES,
} from '../../constants/video'
import { isRecord } from '../isRecord'
import { extractBroadcastIdFromUrl, isBroadcastId, isPostId } from './identity'
import { normalizeMediaUrl, normalizeVariants } from './variants'
import type { VideoMedia, VideoPost } from '../../types/video'

/**
 * Finds a broadcast ID in either form of a timeline card's URL bindings.
 *
 * @param card - Untrusted card metadata from a post response.
 * @returns The linked broadcast identifier, or undefined for an unrelated or invalid card.
 */
function getCardBroadcastId(card: unknown): string | undefined {
  if (!isRecord(card)) {
    return
  }

  const details = isRecord(card['legacy']) ? card['legacy'] : card

  if (
    !isString(details['name'])
    || details['name'].split(':').at(-1) !== 'broadcast'
  ) {
    return
  }

  const bindings = details['binding_values']
  let url: unknown

  if (isArray(bindings)) {
    const binding = bindings.find(
      item => isRecord(item) && item['key'] === 'broadcast_url',
    )

    url = isRecord(binding) ? binding['value'] : undefined
  } else if (isRecord(bindings)) {
    url = bindings['broadcast_url']
  }

  return extractBroadcastIdFromUrl(isRecord(url) ? url['string_value'] : url)
}

/**
 * Validates a captured post, a broadcast card, or a standalone replay entry.
 *
 * @param value - Untrusted post payload with an identifier and media array.
 * @returns The normalized post with up to 16 media entries, or undefined if it has no valid media or broadcast link.
 */
export function normalizePost(value: unknown): VideoPost | undefined {
  if (!isRecord(value) || !isArray(value['media'])) {
    return
  }

  const id = value['id']
  const broadcastId = value['broadcastId']
  const relatedBroadcastId = value['relatedBroadcastId']
  const text = isString(value['text'])
    ? value['text'].slice(0, MAX_POST_TEXT_LENGTH)
    : ''

  if (isBroadcastId(broadcastId) && id === `broadcast-${broadcastId}`) {
    return {
      ...normalizePostMetadata(value),
      id,
      text,
      broadcastId,
      media: [],
    }
  }

  if (!isPostId(id)) {
    return
  }

  const media: VideoMedia[] = []

  for (const item of value['media'].slice(0, MAX_POST_MEDIA)) {
    if (!isRecord(item)) {
      continue
    }

    const variants = normalizeVariants(item['variants'])
    const hasHls = item['hasHls'] === true

    if (!variants.length && !hasHls) {
      continue
    }

    media.push({
      id: isString(item['id'])
        ? item['id'].slice(0, MAX_MEDIA_ID_LENGTH)
        : String(media.length + 1),
      variants,
      hasHls,
    })
  }

  if (!media.length && !isBroadcastId(relatedBroadcastId)) {
    return
  }

  return {
    ...normalizePostMetadata(value),
    id,
    text,
    media,
    ...(isBroadcastId(relatedBroadcastId) ? { relatedBroadcastId } : {}),
  }
}

/**
 * Validates optional author and creation-time metadata for posts and requests.
 *
 * @param value - Object containing candidate author and createdAt fields.
 * @returns Valid metadata only, with creation time converted to ISO 8601.
 */
export function normalizePostMetadata(value: Record<string, unknown>): {
  /**
   * Validated author screen name without the @ prefix.
   */
  author?: string
  /**
   * Validated post creation time normalized to ISO 8601.
   */
  createdAt?: string
} {
  const author = value['author']
  const createdAt = value['createdAt']

  return {
    ...(isString(author) && /^\w{1,30}$/.test(author) ? { author } : {}),
    ...(isString(createdAt)
    && createdAt.length <= MAX_POST_DATE_LENGTH
    && Number.isFinite(Date.parse(createdAt))
      ? { createdAt: new Date(createdAt).toISOString() }
      : {}),
  }
}

/**
 * Traverses a response payload while bounding work and avoiding cyclic objects.
 * Quoted and retweeted videos remain attached to their own string post identifiers.
 *
 * @param payload - Parsed response body that may contain nested posts.
 * @returns Deduplicated posts with video media or broadcast links and any available author and date metadata.
 */
export function extractVideoPosts(payload: unknown): VideoPost[] {
  const posts = new Map<string, VideoPost>()
  const pending = [payload]
  const visited = new WeakSet<object>()
  let budget = MAX_RESPONSE_NODES

  while (pending.length && budget-- > 0) {
    const node = pending.pop()

    if (!node || typeof node !== 'object' || visited.has(node)) {
      continue
    }

    visited.add(node)

    if (isRecord(node)) {
      const legacy = isRecord(node['legacy']) ? node['legacy'] : node
      const entities = isRecord(legacy['extended_entities'])
        ? legacy['extended_entities']
        : legacy['entities']
      const items = isRecord(entities) ? entities['media'] : undefined
      const relatedBroadcastId = getCardBroadcastId(
        node['card'] ?? legacy['card'],
      )

      if (isArray(items) || relatedBroadcastId) {
        const core = node['core']
        const userResults = isRecord(core) ? core['user_results'] : undefined
        const user = isRecord(userResults) ? userResults['result'] : undefined
        const userLegacy = isRecord(user) ? user['legacy'] : undefined
        const userCore = isRecord(user) ? user['core'] : undefined
        const post = normalizePost({
          author:
            (isRecord(userCore) ? userCore['screen_name'] : undefined)
            ?? (isRecord(userLegacy) ? userLegacy['screen_name'] : undefined),
          createdAt: legacy['created_at'],
          id: legacy['id_str'] ?? node['rest_id'],
          relatedBroadcastId,
          text: legacy['full_text'] ?? legacy['text'],
          media: (isArray(items) ? items : [])
            .filter(isRecord)
            .flatMap(item => {
              if (item['type'] !== 'video' && item['type'] !== 'animated_gif') {
                return []
              }

              const info = item['video_info']
              const variants = isRecord(info) ? info['variants'] : undefined

              return [
                {
                  id: item['id_str'] ?? item['media_key'],
                  variants,
                  hasHls:
                    isArray(variants)
                    && variants.some(
                      variant =>
                        isRecord(variant)
                        && normalizeMediaUrl(variant['url'], 'm3u8'),
                    ),
                },
              ]
            }),
        })

        if (post) {
          const previous = posts.get(post.id)

          posts.set(post.id, {
            ...post,
            media: post.media.length ? post.media : (previous?.media ?? []),
            ...(previous?.relatedBroadcastId && !post.relatedBroadcastId
              ? { relatedBroadcastId: previous.relatedBroadcastId }
              : {}),
            author: post.author ?? previous?.author,
            createdAt: post.createdAt ?? previous?.createdAt,
          })
        }
      }
    }

    for (const child of Object.values(node)) {
      if (child && typeof child === 'object') {
        pending.push(child)
      }
    }
  }

  return [...posts.values()]
}
