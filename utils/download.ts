import { filterFalsy, uniqueBy } from '@ntnyq/utils'
import {
  isPostId,
  isRecord,
  isXUrl,
  normalizeMediaUrl,
  normalizePostMetadata,
} from './video'
import type { DownloadRequest } from '../types/video'

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

export function normalizeBatchRequest(
  value: unknown,
): DownloadRequest[] | undefined {
  if (
    !isRecord(value)
    || value['type'] !== 'download-videos'
    || !Array.isArray(value['requests'])
    || !value['requests'].length
    || value['requests'].length > 16
  ) {
    return
  }
  const requests = value['requests'].map(normalizeDownloadRequest)
  if (requests.some(request => !request)) {
    return
  }
  const valid = filterFalsy(requests)
  if (
    uniqueBy(valid, request => request.postId).length !== 1
    || uniqueBy(valid, request => request.mediaIndex).length !== valid.length
  ) {
    return
  }
  return valid
}

export function isAllowedSender(
  sender: { id?: string; url?: string; tab?: unknown },
  extensionId: string,
  popupUrl: string,
): boolean {
  return (
    sender.id === extensionId
    && (sender.tab ? isXUrl(sender.url) : sender.url === popupUrl)
  )
}
