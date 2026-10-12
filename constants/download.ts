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
  | 'stateQueued'
  | 'stateDownloading'
  | 'statePaused'
  | 'stateComplete'
  | 'stateInterrupted'
  | 'stateCancelled'
  | 'stateMissing'
> = {
  cancelled: 'stateCancelled',
  complete: 'stateComplete',
  in_progress: 'stateDownloading',
  interrupted: 'stateInterrupted',
  missing: 'stateMissing',
  paused: 'statePaused',
  queued: 'stateQueued',
}
