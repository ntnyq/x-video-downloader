import { isInteger, isNumber, isString, isUndefined } from '@ntnyq/utils'
import { isRecord } from '../isRecord'
import { isPostId } from '../video/identity'
import type { DownloadStatus } from '../../types/download'

/**
 * Validates progress received from the extension background before rendering it.
 *
 * @param value - Untrusted download status from a runtime response.
 * @returns Whether the value has the required status fields and a supported state.
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
 * Identifies finished tasks eligible for removal from download history.
 *
 * @param download - Download status to check.
 * @returns Whether the task has reached a terminal state.
 */
export function isTerminalDownload(download: DownloadStatus): boolean {
  return !['queued', 'in_progress', 'paused'].includes(download.state)
}

/**
 * Searches local download metadata and optionally matches an exact author.
 *
 * @param downloads - Download records to search.
 * @param query - Case-insensitive search text for filenames, post IDs, and authors.
 * @param author - Optional exact author filter with or without the @ prefix.
 * @returns Matching records in their original order.
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
