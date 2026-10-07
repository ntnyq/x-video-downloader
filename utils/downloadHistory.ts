import { isPostId, isRecord } from './video'
import type { DownloadStatus } from '../types/download'

/**
 * Validates progress received from the extension background before rendering it.
 */
export function isDownloadStatus(value: unknown): value is DownloadStatus {
  return (
    isRecord(value)
    && typeof value['id'] === 'number'
    && Number.isSafeInteger(value['id'])
    && isPostId(value['postId'])
    && typeof value['filename'] === 'string'
    && typeof value['mediaIndex'] === 'number'
    && Number.isInteger(value['mediaIndex'])
    && value['mediaIndex'] >= 1
    && value['mediaIndex'] <= 16
    && typeof value['bytesReceived'] === 'number'
    && Number.isFinite(value['bytesReceived'])
    && typeof value['totalBytes'] === 'number'
    && Number.isFinite(value['totalBytes'])
    && typeof value['startedAt'] === 'number'
    && Number.isFinite(value['startedAt'])
    && (value['author'] === undefined || typeof value['author'] === 'string')
    && (value['error'] === undefined || typeof value['error'] === 'string')
    && typeof value['state'] === 'string'
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
