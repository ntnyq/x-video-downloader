import {
  convertFromBytes,
  isBoolean,
  isInteger,
  isNumber,
  isString,
  orderBy,
  STORAGE_UNITS,
} from '@ntnyq/utils'
import {
  DEFAULT_CONCURRENCY,
  DEFAULT_FILENAME_TEMPLATE,
  DEFAULT_QUALITY,
  FILENAME_TOKENS,
  MAX_CONCURRENCY,
  MAX_FILENAME_STEM_BYTES,
  MAX_FILENAME_TEMPLATE_LENGTH,
  QUALITY_OPTIONS,
} from '../constants/preferences'
import { isRecord, normalizeVariants } from './video'
import type { DownloadPreferences, QualityPreference } from '../types/download'
import type { DownloadRequest, VideoPost, VideoVariant } from '../types/video'

/**
 * Accepts an integer transfer limit from 1 to 6, otherwise using the default.
 *
 * @param value - Untrusted concurrency setting.
 * @returns A supported transfer limit.
 */
export function normalizeConcurrency(value: unknown): number {
  return isNumber(value)
    && isInteger(value)
    && value >= 1
    && value <= MAX_CONCURRENCY
    ? value
    : DEFAULT_CONCURRENCY
}

/**
 * Resolves a stored quality value to a supported preference.
 *
 * @param value - Untrusted quality value from storage or a form control.
 * @returns The supported preference, falling back to highest quality.
 */
export function normalizeQuality(value: unknown): QualityPreference {
  return (
    QUALITY_OPTIONS.find(option => option.value === value)?.value
    ?? DEFAULT_QUALITY
  )
}

/**
 * Checks filename length, path safety, and supported replacement tokens.
 *
 * @param value - User-entered filename template.
 * @returns An empty string when valid, or the translation key for the first error.
 */
export function validateFilenameTemplate(
  value: string,
):
  | ''
  | 'filename.empty'
  | 'filename.tooLong'
  | 'filename.unsafe'
  | 'filename.tokens' {
  if (!value.trim()) {
    return 'filename.empty'
  }
  if (value.length > MAX_FILENAME_TEMPLATE_LENGTH) {
    return 'filename.tooLong'
  }
  if (/[\\/<>:"|?*\p{Cc}]/u.test(value) || value.includes('..')) {
    return 'filename.unsafe'
  }
  const remainder = value.replace(/\{(\w+)\}/g, (_, token: string) =>
    FILENAME_TOKENS.has(token) ? '' : '{}',
  )
  if (/[{}]/.test(remainder)) {
    return 'filename.tokens'
  }
  return ''
}

/**
 * Validates stored preferences and supplies safe defaults for invalid fields.
 *
 * @param value - Untrusted preferences read from extension storage.
 * @returns Preferences with a valid quality, filename template, and save-dialog flag.
 */
export function normalizePreferences(value: unknown): DownloadPreferences {
  const input = isRecord(value) ? value : {}
  const template = input['filenameTemplate']
  return {
    concurrency: normalizeConcurrency(input['concurrency']),
    saveAs: isBoolean(input['saveAs']) ? input['saveAs'] : false,
    quality: normalizeQuality(input['quality']),
    filenameTemplate:
      isString(template) && !validateFilenameTemplate(template)
        ? template
        : DEFAULT_FILENAME_TEMPLATE,
  }
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
 * Builds a single-video request with the post metadata needed for filenames.
 *
 * @param post - Post that owns the selected video.
 * @param mediaIndex - One-based position of the video within the post.
 * @param variant - Selected normalized MP4 version.
 * @returns The message payload for starting the selected download.
 */
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

/**
 * Expands a filename template and produces a safe, bounded MP4 basename.
 * Invalid templates and missing metadata use defaults; the stem is capped at 200 UTF-8 bytes.
 *
 * @param request - Validated download request with optional post metadata.
 * @param template - Filename pattern containing supported replacement tokens.
 * @returns A sanitized filename ending in .mp4 with no directory segments.
 */
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
    if (
      new TextEncoder().encode(safe + char).length > MAX_FILENAME_STEM_BYTES
    ) {
      break
    }
    safe += char
  }
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)) {
    safe = `_${safe}`
  }
  return `${safe.trimEnd().replace(/\.+$/, '')}.mp4`
}

/**
 * Formats byte counts using binary B, KB, and MB thresholds.
 *
 * @param bytes - Byte count; negative or non-finite values indicate an unknown size.
 * @param unknownLabel - Localized text to display when the size is unknown.
 * @returns The formatted size or the supplied unknown-size label.
 */
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
