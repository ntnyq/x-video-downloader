import type { DownloadRequest } from './video'

export type QualityPreference = '1080p' | '720p' | 'highest' | 'smallest'

export interface DownloadPreferences {
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
   * Browser download identifier owned by this extension.
   */
  id: number
  /**
   * Validated request retained to identify and retry the download.
   */
  request: DownloadRequest
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
   * Browser download identifier owned by this extension.
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
   * Expected download size in bytes; negative values mean the size is unknown.
   */
  totalBytes: number
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
}
