import type { DownloadStatus } from '../types/download'

/**
 * Maximum number of distinct videos accepted in one download request.
 */
export const MAX_DOWNLOAD_BATCH_SIZE = 100

/**
 * Maximum completed, interrupted, cancelled, or missing records retained in history.
 */
export const MAX_TERMINAL_RECORDS = 200

/**
 * Maximum unfinished downloads retained by the queue.
 */
export const MAX_OUTSTANDING_DOWNLOADS = 1000

/**
 * Interval in milliseconds between download progress refreshes.
 */
export const DOWNLOAD_REFRESH_INTERVAL_MS = 1000

/**
 * Translation keys for every browser or extension download state.
 */
export const DOWNLOAD_STATE_LABELS: Record<
  DownloadStatus['state'],
  | 'download.state.queued'
  | 'download.state.downloading'
  | 'download.state.paused'
  | 'download.state.complete'
  | 'download.state.interrupted'
  | 'download.state.cancelled'
  | 'download.state.missing'
> = {
  cancelled: 'download.state.cancelled',
  complete: 'download.state.complete',
  in_progress: 'download.state.downloading',
  interrupted: 'download.state.interrupted',
  missing: 'download.state.missing',
  paused: 'download.state.paused',
  queued: 'download.state.queued',
}
