import { isInteger, isNumber, isString, isUndefined } from '@ntnyq/utils'
import { isPostId, isRecord } from './video'
import type { DownloadStatus } from '../types/download'

/**
 * Validates progress received from the extension background before rendering it.
 */
export function isDownloadStatus(value: unknown): value is DownloadStatus {
  return (
    isRecord(value)
    && isNumber(value['id'])
    && Number.isSafeInteger(value['id'])
    && isPostId(value['postId'])
    && isString(value['filename'])
    && isNumber(value['mediaIndex'])
    && isInteger(value['mediaIndex'])
    && value['mediaIndex'] >= 1
    && value['mediaIndex'] <= 16
    && isNumber(value['bytesReceived'])
    && Number.isFinite(value['bytesReceived'])
    && isNumber(value['totalBytes'])
    && Number.isFinite(value['totalBytes'])
    && isNumber(value['startedAt'])
    && Number.isFinite(value['startedAt'])
    && (isUndefined(value['author']) || isString(value['author']))
    && (isUndefined(value['error']) || isString(value['error']))
    && isString(value['state'])
    && [
      'queued',
      'in_progress',
      'complete',
      'interrupted',
      'cancelled',
      'paused',
      'missing',
    ].includes(value['state'])
  )
}

/**
 * Keeps queued, paused, and transferring tasks available when history is cleared.
 */
export function isTerminalDownload(download: DownloadStatus): boolean {
  return !['queued', 'in_progress', 'paused'].includes(download.state)
}

/**
 * Searches local download metadata and optionally matches an exact author.
 */
export function filterDownloadHistory(
  downloads: DownloadStatus[],
  query: string,
  author = '',
): DownloadStatus[] {
  const normalizedQuery = query.trim().toLowerCase()
  const normalizedAuthor = author.replace(/^@/, '').toLowerCase()
  return downloads.filter(download => {
    if (
      normalizedAuthor
      && download.author?.toLowerCase() !== normalizedAuthor
    ) {
      return false
    }
    return [download.filename, download.postId, download.author ?? '']
      .join(' ')
      .toLowerCase()
      .includes(normalizedQuery)
  })
}
