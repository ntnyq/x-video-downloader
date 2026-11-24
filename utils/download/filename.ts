import {
  DEFAULT_FILENAME_TEMPLATE,
  FILENAME_TOKENS,
  MAX_FILENAME_STEM_BYTES,
  MAX_FILENAME_TEMPLATE_LENGTH,
} from '../../constants/preferences'
import { normalizeVariants } from '../video/variants'
import type { DownloadRequest, VideoVariant } from '../../types/video'

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
 * Expands a filename template and produces a safe, bounded MP4 basename.
 * Invalid templates and missing metadata use defaults; the stem is capped at 200 UTF-8 bytes.
 *
 * @param request - Validated download request with optional post metadata.
 * @param template - Filename pattern containing supported replacement tokens.
 * @param dimensions - Selected rendition dimensions used in place of dimensions inferred from the media URL.
 * @returns A sanitized filename ending in .mp4 with no directory segments.
 */
export function buildFilename(
  request: Omit<DownloadRequest, 'type' | 'url'> & {
    type?: DownloadRequest['type']
    url?: string
  },
  template: string,
  dimensions?: Pick<VideoVariant, 'width' | 'height'>,
): string {
  const variant = dimensions ?? normalizeVariants([{ url: request.url }])[0]
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
