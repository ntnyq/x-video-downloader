import { orderBy } from '@ntnyq/utils'
import type { VideoMedia, VideoPost, VideoVariant } from '../types/video'

/**
 * Checks that a page message is a non-null object, excluding arrays and functions.
 * The guard from `@ntnyq/utils` also accepts functions, so it cannot serve this boundary.
 *
 * @param value - Untrusted value received from a page or browser message.
 * @returns Whether the value can be inspected as a string-keyed object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Checks that a post identifier is a string containing 1 to 25 decimal digits.
 *
 * @param value - Candidate identifier from an external payload.
 * @returns Whether the value is a supported post identifier.
 */
export function isPostId(value: unknown): value is string {
  return typeof value === 'string' && /^\d{1,25}$/.test(value)
}

/**
 * Checks for an HTTPS X or Twitter URL without credentials or a non-default port.
 *
 * @param value - Candidate page URL.
 * @returns Whether the URL belongs to X, Twitter, or one of their subdomains.
 */
export function isXUrl(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false
  }
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:'
      && /^(?:[\w-]+\.)*(?:x|twitter)\.com$/.test(url.hostname)
      && !url.username
      && !url.password
      && !url.port
    )
  } catch {
    return false
  }
}

/**
 * Extracts a post identifier from an allowed X or Twitter status URL.
 *
 * @param value - Candidate URL, including optional photo or video path suffixes.
 * @returns The string post identifier, or undefined for an unsupported URL.
 */
export function getPostId(value: unknown): string | undefined {
  if (!isXUrl(value)) {
    return
  }
  return new URL(value).pathname.match(
    /\/(?:status|statuses)\/(\d{1,25})(?:\/|$)/,
  )?.[1]
}

/**
 * Validates a video.twimg.com media URL and removes its fragment.
 *
 * @param value - Untrusted media URL, limited to 8192 characters.
 * @param extension - Required file extension; defaults to MP4, with HLS used for detection.
 * @returns The normalized HTTPS URL, or undefined when validation fails.
 */
export function normalizeMediaUrl(
  value: unknown,
  extension: 'mp4' | 'm3u8' = 'mp4',
): string | undefined {
  if (typeof value !== 'string' || value.length > 8192) {
    return
  }
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:'
      || url.hostname !== 'video.twimg.com'
      || url.username
      || url.password
      || url.port
      || !url.pathname.toLowerCase().endsWith(`.${extension}`)
    ) {
      return
    }
    url.hash = ''
    return url.href
  } catch {}
}

/**
 * Normalizes up to 32 media versions and deduplicates them by MP4 URL.
 * Later duplicates replace metadata; results are sorted by pixels and then bitrate.
 *
 * @param value - Untrusted array of media versions.
 * @returns Valid MP4 versions, or an empty array when none can be used.
 */
export function normalizeVariants(value: unknown): VideoVariant[] {
  if (!Array.isArray(value)) {
    return []
  }
  const variants = new Map<string, VideoVariant>()
  for (const item of value.slice(0, 32)) {
    if (!isRecord(item)) {
      continue
    }
    const url = normalizeMediaUrl(item['url'])
    if (!url) {
      continue
    }
    const size = new URL(url).pathname.match(/\/(\d{2,5})x(\d{2,5})\//)
    const rawBitrate = item['bitrate'] ?? item['bit_rate']
    const bitrate = typeof rawBitrate === 'number' ? rawBitrate : 0
    variants.set(url, {
      url,
      bitrate: Number.isFinite(bitrate) && bitrate > 0 ? bitrate : 0,
      width: Number(size?.[1] ?? 0),
      height: Number(size?.[2] ?? 0),
    })
  }
  return orderBy(
    [...variants.values()],
    [variant => variant.width * variant.height, 'bitrate'],
    { directions: 'desc' },
  )
}

/**
 * Validates a captured post and retains up to 16 video or HLS media entries.
 *
 * @param value - Untrusted post payload with an identifier and media array.
 * @returns The normalized post, or undefined when no valid video media remains.
 */
export function normalizePost(value: unknown): VideoPost | undefined {
  if (
    !isRecord(value)
    || !isPostId(value['id'])
    || !Array.isArray(value['media'])
  ) {
    return
  }
  const media: VideoMedia[] = []
  for (const item of value['media'].slice(0, 16)) {
    if (!isRecord(item)) {
      continue
    }
    const variants = normalizeVariants(item['variants'])
    const hasHls = item['hasHls'] === true
    if (!variants.length && !hasHls) {
      continue
    }
    media.push({
      id:
        typeof item['id'] === 'string'
          ? item['id'].slice(0, 80)
          : String(media.length + 1),
      variants,
      hasHls,
    })
  }
  if (!media.length) {
    return
  }
  return {
    ...normalizePostMetadata(value),
    id: value['id'],
    text: typeof value['text'] === 'string' ? value['text'].slice(0, 280) : '',
    media,
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
    ...(typeof author === 'string' && /^\w{1,30}$/.test(author)
      ? { author }
      : {}),
    ...(typeof createdAt === 'string'
    && createdAt.length <= 80
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
 * @returns Deduplicated video posts with available author and creation-time metadata.
 */
export function extractVideoPosts(payload: unknown): VideoPost[] {
  const posts = new Map<string, VideoPost>()
  const pending = [payload]
  const visited = new WeakSet<object>()
  let budget = 60_000
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
      if (Array.isArray(items)) {
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
          text: legacy['full_text'] ?? legacy['text'],
          media: items.filter(isRecord).flatMap(item => {
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
                  Array.isArray(variants)
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

/**
 * Formats the resolution and optional bitrate of an MP4 version for display.
 *
 * @param variant - Normalized video version to describe.
 * @param originalLabel - Localized fallback when dimensions are unknown.
 * @returns A resolution or fallback label, followed by Mbps when bitrate is available.
 */
export function formatVariant(
  variant: VideoVariant,
  originalLabel = 'Original MP4',
): string {
  const size =
    variant.width && variant.height
      ? `${variant.width} × ${variant.height}`
      : originalLabel
  return variant.bitrate
    ? `${size} · ${(variant.bitrate / 1_000_000).toFixed(2)} Mbps`
    : size
}
