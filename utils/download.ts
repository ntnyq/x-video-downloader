import { filterFalsy, uniqueBy } from '@ntnyq/utils'
import {
  isPostId,
  isRecord,
  isXUrl,
  normalizeMediaUrl,
  normalizePostMetadata,
} from './video'
import type { DownloadRequest } from '../types/video'

export const MAX_DOWNLOAD_BATCH_SIZE = 100

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
    || typeof mediaIndex !== 'number'
    || !Number.isInteger(mediaIndex)
    || mediaIndex < 1
    || mediaIndex > 16
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
    || !Array.isArray(value['requests'])
    || !value['requests'].length
    || value['requests'].length > MAX_DOWNLOAD_BATCH_SIZE
  ) {
    return
  }
  const requests = value['requests'].map(normalizeDownloadRequest)
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

/**
 * Accepts messages only from this extension's popup or an X/Twitter content script.
 *
 * @param sender - Browser-supplied identity and page information for the message sender.
 * @param sender.id - Extension identifier supplied by the browser.
 * @param sender.url - URL of the sending popup or content-script page.
 * @param sender.tab - Optional tab metadata identifying a content-script sender.
 * @param extensionId - Identifier of the running extension.
 * @param popupUrl - Exact extension popup URL allowed to send requests.
 * @returns Whether the sender matches both the extension and an allowed surface.
 */
export function isAllowedSender(
  sender: {
    /**
     * Extension identifier reported by the browser for the message sender.
     */
    id?: string
    /**
     * URL of the sending popup or content-script page.
     */
    url?: string
    /**
     * Browser tab metadata indicating that the sender is a content script.
     */
    tab?: unknown
  },
  extensionId: string,
  popupUrl: string,
): boolean {
  return (
    sender.id === extensionId
    && (sender.tab ? isXUrl(sender.url) : sender.url === popupUrl)
  )
}
