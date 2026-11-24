import { isArray, isNumber, isString, orderBy } from '@ntnyq/utils'
import { MAX_MEDIA_URL_LENGTH, MAX_VIDEO_VARIANTS } from '../../constants/video'
import { isRecord } from '../isRecord'
import type { QualityPreference } from '../../types/download'
import type { VideoVariant } from '../../types/video'

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
  if (!isString(value) || value.length > MAX_MEDIA_URL_LENGTH) {
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

    if (url.href.length <= MAX_MEDIA_URL_LENGTH) {
      return url.href
    }
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
  if (!isArray(value)) {
    return []
  }

  const variants = new Map<string, VideoVariant>()

  for (const item of value.slice(0, MAX_VIDEO_VARIANTS)) {
    if (!isRecord(item)) {
      continue
    }

    const url = normalizeMediaUrl(item['url'])

    if (!url) {
      continue
    }

    const size = new URL(url).pathname.match(/\/(\d{2,5})x(\d{2,5})\//)
    const rawBitrate = item['bitrate'] ?? item['bit_rate']
    const bitrate = isNumber(rawBitrate) ? rawBitrate : 0

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
 * Selects a normalized MP4 version according to the saved quality preference.
 * Portrait caps use the shorter edge; if no known resolution fits, the smallest is used.
 *
 * @param variants - Available versions, which are normalized without mutating the input.
 * @param preference - Highest, smallest, or a maximum short-edge resolution.
 * @returns The selected version, or undefined when no valid MP4 version exists.
 */
export function selectPreferredVariant(
  variants: VideoVariant[],
  preference: QualityPreference,
): VideoVariant | undefined {
  const sorted = normalizeVariants(variants)

  if (preference === 'highest') {
    return sorted[0]
  }

  if (preference === 'smallest') {
    const hasAllBitrates = sorted.every(variant => variant.bitrate > 0)

    return orderBy(sorted, variant =>
      hasAllBitrates
        ? variant.bitrate
        : variant.width * variant.height || Infinity,
    )[0]
  }

  const cap = preference === '1080p' ? 1080 : 720
  const known = sorted.filter(
    variant => variant.width > 0 && variant.height > 0,
  )

  return (
    known.find(variant => Math.min(variant.width, variant.height) <= cap)
    ?? known.at(-1)
    ?? sorted[0]
  )
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
