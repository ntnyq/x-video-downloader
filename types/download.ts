import type { DownloadRequest } from './video'

export type QualityPreference = '1080p' | '720p' | 'highest' | 'smallest'

export interface DownloadPreferences {
  filenameTemplate: string
  quality: QualityPreference
  saveAs: boolean
}

export interface DownloadRecord {
  filename: string
  id: number
  request: DownloadRequest
}

export interface DownloadStatus {
  bytesReceived: number
  filename: string
  id: number
  mediaIndex: number
  postId: string
  totalBytes: number
  error?: string
  state:
    | 'cancelled'
    | 'complete'
    | 'in_progress'
    | 'interrupted'
    | 'missing'
    | 'paused'
}

export interface BatchDownloadRequest {
  requests: DownloadRequest[]
  type: 'download-videos'
}

export interface DownloadActionRequest {
  action: 'cancel' | 'retry'
  downloadId: number
  type: 'download-action'
}
