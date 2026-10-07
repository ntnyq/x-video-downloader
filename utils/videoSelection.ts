import { unique } from '@ntnyq/utils'
import { createDownloadRequest, selectPreferredVariant } from './preferences'
import type { QualityPreference } from '../types/download'
import type {
  DownloadRequest,
  VideoMedia,
  VideoPost,
  VideoVariant,
} from '../types/video'

export interface VideoSelectionState {
  /**
   * Manual quality choices indexed by post identifier and one-based media position.
   */
  selectedUrls: Record<string, string>
  /**
   * Downloadable media explicitly excluded from the batch selection.
   */
  excludedKeys: string[]
}

export interface VideoSelectionRow {
  /**
   * Stable post and media identity shared by selection and download requests.
   */
  key: string
  /**
   * Post metadata retained for batch requests and filenames.
   */
  post: VideoPost
  /**
   * Available versions and stream format for this media entry.
   */
  media: VideoMedia
  /**
   * One-based media position within its own post.
   */
  index: number
  /**
   * Whether this downloadable row belongs to the selected batch.
   */
  checked: boolean
  /**
   * Effective manual quality choice or preferred MP4 version.
   */
  variant?: VideoVariant
}

export interface VideoSelectionScope {
  /**
   * Optional post filter for a per-post download action.
   */
  postId?: string
  /**
   * Optional one-based position for a single-video action within the selected post.
   */
  mediaIndex?: number
  /**
   * Whether to use the best quality without changing the saved manual selection.
   */
  highest?: boolean
}

/**
 * Resolves current-page media against a shared selection and quality state.
 * HLS-only media remains visible but cannot be selected or submitted.
 *
 * @param posts - Captured posts currently visible in the download surface.
 * @param quality - Saved quality preference for rows without a manual choice.
 * @param selection - Manual quality choices and explicit exclusions.
 * @returns Ordered media rows with identities scoped to each owning post.
 */
export function createVideoSelectionRows(
  posts: VideoPost[],
  quality: QualityPreference,
  selection: VideoSelectionState,
): VideoSelectionRow[] {
  const excludedKeys = new Set(selection.excludedKeys)
  return posts.flatMap(post =>
    post.media.map((media, offset) => {
      const index = offset + 1
      const key = `${post.id}:${index}`
      const variant =
        media.variants.find(
          variant => variant.url === selection.selectedUrls[key],
        ) ?? selectPreferredVariant(media.variants, quality)
      return {
        key,
        post,
        media,
        index,
        variant,
        checked: Boolean(variant) && !excludedKeys.has(key),
      }
    }),
  )
}

/**
 * Updates a group or single-media selection while preserving unrelated posts.
 *
 * @param selection - Existing page selection state.
 * @param keys - Post and media pairs included in the selection action.
 * @param checked - Whether the targeted rows should be selected.
 * @returns A new selection state without mutating existing quality choices.
 */
export function setVideoSelectionChecked(
  selection: VideoSelectionState,
  keys: string[],
  checked: boolean,
): VideoSelectionState {
  const targetKeys = new Set(keys)
  return {
    ...selection,
    excludedKeys: checked
      ? selection.excludedKeys.filter(key => !targetKeys.has(key))
      : unique([...selection.excludedKeys, ...keys]),
  }
}

/**
 * Builds a page batch or a single-post/media request without dropping selections.
 * Callers must enforce the batch limit before sending this complete request list.
 *
 * @param rows - Visible media with shared selection and quality state.
 * @param scope - Optional post, media, and best-quality overrides.
 * @returns Every matching downloadable request in page order.
 */
export function createSelectedVideoRequests(
  rows: VideoSelectionRow[],
  scope: VideoSelectionScope = {},
): DownloadRequest[] {
  return rows.flatMap(row => {
    if (scope.postId !== undefined && row.post.id !== scope.postId) {
      return []
    }
    if (
      scope.mediaIndex === undefined
        ? !row.checked
        : row.index !== scope.mediaIndex
    ) {
      return []
    }
    const variant = scope.highest
      ? selectPreferredVariant(row.media.variants, 'highest')
      : row.variant
    return variant ? [createDownloadRequest(row.post, row.index, variant)] : []
  })
}
