export interface VideoVariant {
  /**
   * Video bitrate in bits per second, or zero when unavailable.
   */
  bitrate: number
  /**
   * Video height in pixels, or zero when the URL has no dimensions.
   */
  height: number
  /**
   * Validated HTTPS MP4 URL hosted on video.twimg.com.
   */
  url: string
  /**
   * Video width in pixels, or zero when the URL has no dimensions.
   */
  width: number
}

export interface VideoMedia {
  /**
   * Whether an HLS stream exists, including media with no downloadable MP4.
   */
  hasHls: boolean
  /**
   * Media identifier from the response, or a locally generated fallback.
   */
  id: string
  /**
   * Downloadable MP4 versions ordered by pixel count and then bitrate.
   */
  variants: VideoVariant[]
}

export interface VideoPost {
  /**
   * Post identifier kept as a string to preserve large snowflake IDs.
   */
  id: string
  /**
   * Videos and animated GIFs belonging to this post in media order.
   */
  media: VideoMedia[]
  /**
   * Post text for display, limited to 280 characters when normalized.
   */
  text: string
  /**
   * Author screen name without the @ prefix, when available.
   */
  author?: string
  /**
   * Post creation time normalized to an ISO 8601 string, when available.
   */
  createdAt?: string
}

export interface PageVideos {
  /**
   * Whether the page response capture script has announced readiness.
   */
  captureReady: boolean
  /**
   * Captured posts associated with the current page or visible timeline.
   */
  posts: VideoPost[]
  /**
   * Post identifier in the current page URL, when viewing a post.
   */
  currentPostId?: string
}

export interface DownloadRequest {
  /**
   * One-based position of the video within its post, from 1 to 16.
   */
  mediaIndex: number
  /**
   * Identifier of the post that owns the requested video.
   */
  postId: string
  /**
   * Message discriminator for a single-video download request.
   */
  type: 'download-video'
  /**
   * Validated HTTPS MP4 URL hosted on video.twimg.com.
   */
  url: string
  /**
   * Author screen name without the @ prefix, when available.
   */
  author?: string
  /**
   * Post creation time normalized to an ISO 8601 string, when available.
   */
  createdAt?: string
}

export type DownloadResult =
  | {
      /**
       * Accepted native identifier, or a negative identifier for a queued task.
       */
      downloadId: number
      /**
       * Indicates that the queue or browser accepted or already owns the task.
       */
      ok: true
    }
  | {
      /**
       * Application error code or native browser message describing the failure.
       */
      error: string
      /**
       * Indicates that the download could not be started.
       */
      ok: false
    }
