import {
  filterFalsy,
  isArray,
  isInteger,
  isNumber,
  uniqueBy,
} from '@ntnyq/utils'
import { MAX_DOWNLOAD_BATCH_SIZE } from '../../constants/download'
import { MAX_POST_MEDIA } from '../../constants/video'
import { isRecord } from '../isRecord'
import { isPostId } from '../video/identity'
import { normalizePostMetadata } from '../video/posts'
import { normalizeMediaUrl } from '../video/variants'
import type {
  DownloadRequest,
  VideoPost,
  VideoVariant,
} from '../../types/video'

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
 * Validates a single-video message before it reaches the download manager.
 *
 * @param value - Untrusted message with a post identifier, media position, and MP4 URL.
 * @returns A normalized request, or undefined when its type, identity, or URL is invalid.
 */
export function normalizeDownloadRequest(
  value: unknown,
): DownloadRequest | undefined {
  if (
    !isRecord(value)
    || value['type'] !== 'download-video'
    || !isPostId(value['postId'])
  ) {
    return
  }

  const url = normalizeMediaUrl(value['url'])
  const mediaIndex = value['mediaIndex']

  if (
    !url
    || !isNumber(mediaIndex)
    || !isInteger(mediaIndex)
    || mediaIndex < 1
    || mediaIndex > MAX_POST_MEDIA
  ) {
    return
  }

  return {
    type: 'download-video',
    postId: value['postId'],
    url,
    mediaIndex,
    ...normalizePostMetadata(value),
  }
}

/**
 * Validates up to 100 distinct post and media pairs, including cross-post batches.
 *
 * @param value - Untrusted batch message containing single-video requests.
 * @returns Validated requests in input order, or undefined if any batch constraint fails.
 */
export function normalizeBatchRequest(
  value: unknown,
): DownloadRequest[] | undefined {
  if (
    !isRecord(value)
    || value['type'] !== 'download-videos'
    || !isArray(value['requests'])
    || !value['requests'].length
    || value['requests'].length > MAX_DOWNLOAD_BATCH_SIZE
  ) {
    return
  }

  const requests = Array.from(value['requests'], normalizeDownloadRequest)

  if (requests.some(request => !request)) {
    return
  }

  const valid = filterFalsy(requests)

  if (
    uniqueBy(valid, request => `${request.postId}:${request.mediaIndex}`).length
    !== valid.length
  ) {
    return
  }

  return valid
}
