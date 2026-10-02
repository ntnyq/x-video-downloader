export interface VideoVariant {
  bitrate: number
  height: number
  url: string
  width: number
}

export interface VideoMedia {
  hasHls: boolean
  id: string
  variants: VideoVariant[]
}

export interface VideoPost {
  id: string
  media: VideoMedia[]
  text: string
  author?: string
  createdAt?: string
}

export interface PageVideos {
  captureReady: boolean
  posts: VideoPost[]
  currentPostId?: string
}

export interface DownloadRequest {
  mediaIndex: number
  postId: string
  type: 'download-video'
  url: string
  author?: string
  createdAt?: string
}

export type DownloadResult =
  | { downloadId: number; ok: true }
  | { error: string; ok: false }
