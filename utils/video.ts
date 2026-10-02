import { orderBy } from '@ntnyq/utils'
import type { VideoMedia, VideoPost, VideoVariant } from '../types/video'

/**
 * Page messages must be non-null objects, excluding arrays and functions.
 * The `@ntnyq/utils` isRecord guard also accepts functions.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isPostId(value: unknown): value is string {
  return typeof value === 'string' && /^\d{1,25}$/.test(value)
}

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

export function getPostId(value: unknown): string | undefined {
  if (!isXUrl(value)) {
    return
  }
  return new URL(value).pathname.match(
    /\/(?:status|statuses)\/(\d{1,25})(?:\/|$)/,
  )?.[1]
}

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

export function normalizePostMetadata(value: Record<string, unknown>): {
  author?: string
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
 * Keep quoted/retweeted media attached to their own string IDs.
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
