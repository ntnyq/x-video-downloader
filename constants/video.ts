/**
 * Versioned message channel shared by page capture and isolated content scripts.
 */
export const VIDEO_CHANNEL = 'x-video-downloader:v2'

/**
 * Supported X and Twitter URL patterns for extension content scripts.
 */
export const X_MATCHES = ['https://*.x.com/*', 'https://*.twitter.com/*']

/**
 * Maximum posts retained in each capture or page cache.
 */
export const MAX_CACHED_POSTS = 250

/**
 * Maximum accepted media URL length in UTF-16 code units.
 */
export const MAX_MEDIA_URL_LENGTH = 8192

/**
 * Maximum variants inspected for each video before filtering and deduplication.
 */
export const MAX_VIDEO_VARIANTS = 32

/**
 * Maximum media entries per post and largest accepted one-based media index.
 */
export const MAX_POST_MEDIA = 16

/**
 * Maximum retained media identifier length in UTF-16 code units.
 */
export const MAX_MEDIA_ID_LENGTH = 80

/**
 * Maximum retained post preview length in UTF-16 code units.
 */
export const MAX_POST_TEXT_LENGTH = 280

/**
 * Maximum creation-date string length accepted before date parsing.
 */
export const MAX_POST_DATE_LENGTH = 80

/**
 * Maximum traversal iterations when extracting posts from one response.
 */
export const MAX_RESPONSE_NODES = 60_000

/**
 * Minimum milliseconds between replies to capture replay requests.
 */
export const CAPTURE_REPLAY_INTERVAL_MS = 300

/**
 * Interval in milliseconds between popup requests for page videos.
 */
export const PAGE_VIDEOS_REFRESH_INTERVAL_MS = 1500
