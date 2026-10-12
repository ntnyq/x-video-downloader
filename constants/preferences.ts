import type { QualityPreference } from '../types/download'
import type { DownloadRequest } from '../types/video'

/**
 * Filename template used when no valid custom template is stored.
 */
export const DEFAULT_FILENAME_TEMPLATE =
  '{author}_{date}_{postId}_{index}_{quality}'

/**
 * Number of simultaneous transfers used when the saved limit is invalid.
 */
export const DEFAULT_CONCURRENCY = 3

/**
 * Maximum number of simultaneous transfers offered and accepted.
 */
export const MAX_CONCURRENCY = 6

/**
 * Quality preference used when the saved choice is missing or invalid.
 */
export const DEFAULT_QUALITY = 'highest' satisfies QualityPreference

/**
 * Maximum filename template length in UTF-16 code units.
 */
export const MAX_FILENAME_TEMPLATE_LENGTH = 160

/**
 * Maximum UTF-8 byte length of a generated filename before the MP4 extension.
 */
export const MAX_FILENAME_STEM_BYTES = 200

/**
 * Available quality preferences and their translation keys, in display order.
 */
export const QUALITY_OPTIONS: Array<{
  /**
   * Stored quality preference represented by this option.
   */
  value: QualityPreference
  /**
   * Translation key used to display the quality option.
   */
  label: 'qualityHighest' | 'quality1080' | 'quality720' | 'qualitySmallest'
}> = [
  { label: 'qualityHighest', value: 'highest' },
  { label: 'quality1080', value: '1080p' },
  { label: 'quality720', value: '720p' },
  { label: 'qualitySmallest', value: 'smallest' },
]

/**
 * Replacement tokens accepted in a download filename template.
 */
export const FILENAME_TOKENS = new Set([
  'author',
  'date',
  'index',
  'postId',
  'quality',
])

/**
 * Fixed sample download used to preview filename template expansion.
 */
export const FILENAME_PREVIEW_REQUEST: DownloadRequest = {
  author: 'ntnyq',
  createdAt: '2026-10-02T12:00:00.000Z',
  mediaIndex: 1,
  postId: '2105974296740811141',
  type: 'download-video',
  url: 'https://video.twimg.com/ext_tw_video/1/pu/vid/1920x1080/sample.mp4',
}
