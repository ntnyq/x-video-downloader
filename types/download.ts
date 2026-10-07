import type { DownloadRequest } from './video'

export type QualityPreference = '1080p' | '720p' | 'highest' | 'smallest'

export interface DownloadPreferences {
  /**
   * Maximum number of transfers allowed to run concurrently, from 1 to 6.
   */
  concurrency: number
  /**
   * Filename pattern using author, date, postId, index, and quality tokens.
   */
  filenameTemplate: string
  /**
   * Preferred strategy for selecting a downloadable MP4 version.
   */
  quality: QualityPreference
  /**
   * Whether the browser should prompt for a save location for each video.
   */
  saveAs: boolean
}

export interface DownloadRecord {
  /**
   * Requested MP4 filename retained as a fallback for browser records.
   */
  filename: string
  /**
   * Native download identifier, or a negative identifier for work still in the queue.
   */
  id: number
  /**
   * Validated request retained to identify and retry the download.
   */
  request: DownloadRequest
  /**
   * Last observed byte count, retained when native history is erased.
   */
  bytesReceived?: number
  /**
   * Last observed browser basename, including user renames.
   */
  displayFilename?: string
  /**
   * Last native or queue failure code.
   */
  error?: string
  /**
   * Original negative queue identifier, retained so pending UI actions stay valid.
   */
  queueId?: number
  /**
   * Save-dialog choice captured when the task was queued.
   */
  saveAs?: boolean
  /**
   * Task creation time in milliseconds, retained across queue and native states.
   */
  startedAt?: number
  /**
   * Whether native acceptance was pending when the record was persisted.
   */
  starting?: boolean
  /**
   * Last observed state, including tasks that have not reached the browser yet.
   */
  state?: DownloadStatus['state']
  /**
   * Last observed expected byte count, or -1 when unknown.
   */
  totalBytes?: number
}

export interface DownloadStatus {
  /**
   * Number of bytes received, or zero when the browser record is missing.
   */
  bytesReceived: number
  /**
   * Display filename without directories, including browser or user renames.
   */
  filename: string
  /**
   * Native download identifier, or a negative identifier for work still in the queue.
   */
  id: number
  /**
   * One-based position of the downloaded video within its post.
   */
  mediaIndex: number
  /**
   * Identifier of the post that owns this download.
   */
  postId: string
  /**
   * Task creation time in milliseconds, or zero for legacy records.
   */
  startedAt: number
  /**
   * Expected download size in bytes; negative values mean the size is unknown.
   */
  totalBytes: number
  /**
   * Post author retained for download history search.
   */
  author?: string
  /**
   * Original post creation time, when available.
   */
  createdAt?: string
  /**
   * Native browser error code when the transfer has failed or was cancelled.
   */
  error?: string
  /**
   * Normalized transfer state, including paused, cancelled, and missing records.
   */
  state:
    | 'cancelled'
    | 'complete'
    | 'in_progress'
    | 'interrupted'
    | 'missing'
    | 'paused'
    | 'queued'
}
