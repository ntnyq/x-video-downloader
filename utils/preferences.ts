import { convertFromBytes, orderBy, STORAGE_UNITS } from '@ntnyq/utils'
import { isRecord, normalizeVariants } from './video'
import type { DownloadPreferences, QualityPreference } from '../types/download'
import type { DownloadRequest, VideoPost, VideoVariant } from '../types/video'

export const DEFAULT_FILENAME_TEMPLATE =
  '{author}_{date}_{postId}_{index}_{quality}'
export const QUALITY_OPTIONS: Array<{
  value: QualityPreference
  label: 'qualityHighest' | 'quality1080' | 'quality720' | 'qualitySmallest'
}> = [
  { value: 'highest', label: 'qualityHighest' },
  { value: '1080p', label: 'quality1080' },
  { value: '720p', label: 'quality720' },
  { value: 'smallest', label: 'qualitySmallest' },
]
const FILENAME_TOKENS = new Set([
  'author',
  'date',
  'postId',
  'index',
  'quality',
])

export function normalizeQuality(value: unknown): QualityPreference {
  return (
    QUALITY_OPTIONS.find(option => option.value === value)?.value ?? 'highest'
  )
}

export function validateFilenameTemplate(
  value: string,
):
  | ''
  | 'filenameEmpty'
  | 'filenameTooLong'
  | 'filenameUnsafe'
  | 'filenameTokens' {
  if (!value.trim()) {
    return 'filenameEmpty'
  }
  if (value.length > 160) {
    return 'filenameTooLong'
  }
  if (/[\\/<>:"|?*\p{Cc}]/u.test(value) || value.includes('..')) {
    return 'filenameUnsafe'
  }
  const remainder = value.replace(/\{(\w+)\}/g, (_, token: string) =>
    FILENAME_TOKENS.has(token) ? '' : '{}',
  )
  if (/[{}]/.test(remainder)) {
    return 'filenameTokens'
  }
  return ''
}

export function normalizePreferences(value: unknown): DownloadPreferences {
  const input = isRecord(value) ? value : {}
  const template = input['filenameTemplate']
  return {
    saveAs: typeof input['saveAs'] === 'boolean' ? input['saveAs'] : true,
    quality: normalizeQuality(input['quality']),
    filenameTemplate:
      typeof template === 'string' && !validateFilenameTemplate(template)
        ? template
        : DEFAULT_FILENAME_TEMPLATE,
  }
}

/**
 * For portrait videos, the shorter edge determines the 720p / 1080p class.
 * If no variant fits the cap, use the smallest known resolution.
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

export function createDownloadRequest(
  post: VideoPost,
  mediaIndex: number,
  variant: VideoVariant,
): DownloadRequest {
  return {
    type: 'download-video',
    postId: post.id,
    mediaIndex,
    url: variant.url,
    author: post.author,
    createdAt: post.createdAt,
  }
}

export function buildFilename(
  request: DownloadRequest,
  template: string,
): string {
  const variant = normalizeVariants([{ url: request.url }])[0]
  const values: Record<string, string> = {
    author: request.author || 'unknown',
    date: request.createdAt?.slice(0, 10) || 'undated',
    postId: request.postId,
    index: String(request.mediaIndex),
    quality:
      variant?.width && variant.height
        ? `${variant.width}x${variant.height}`
        : 'original',
  }
  const validTemplate = validateFilenameTemplate(template)
    ? DEFAULT_FILENAME_TEMPLATE
    : template
  const stem = validTemplate
    .replace(/\.mp4$/i, '')
    .replace(/\{(\w+)\}/g, (_, token: string) => values[token] ?? '')
    .replace(/[\\/<>:"|?*\p{Cc}]/gu, '_')
    .replace(/\.{2,}/g, '_')
    .replace(/^[.\s]+|[.\s]+$/g, '')
  // Bound UTF-8 bytes too: browser filesystems typically cap one name at 255 bytes.
  let safe = ''
  for (const char of stem || `X-${request.postId}-${request.mediaIndex}`) {
    if (new TextEncoder().encode(safe + char).length > 200) {
      break
    }
    safe += char
  }
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)) {
    safe = `_${safe}`
  }
  return `${safe.trimEnd().replace(/\.+$/, '')}.mp4`
}

export function formatBytes(
  bytes: number,
  unknownLabel = 'Unknown size',
): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return unknownLabel
  }
  if (bytes < STORAGE_UNITS.KB) {
    return `${bytes} B`
  }
  if (bytes < STORAGE_UNITS.MB) {
    return `${convertFromBytes(bytes, 'KB').toFixed(1)} KB`
  }
  return `${convertFromBytes(bytes, 'MB').toFixed(1)} MB`
}
