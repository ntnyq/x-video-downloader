import { isString } from '@ntnyq/utils'
import { MAX_MEDIA_URL_LENGTH, REPLAY_MEDIA_HOSTS } from '../../constants/video'

/**
 * Validates an absolute HLS resource URL on an allowed replay CDN.
 *
 * @param value - Untrusted absolute URL from capture or a playlist.
 * @param kind - Expected playlist or media resource type.
 * @returns A validated HTTPS URL with its fragment removed, or undefined when the resource is unsupported.
 */
export function normalizeReplayUrl(
  value: unknown,
  kind: 'playlist' | 'segment',
): string | undefined {
  if (
    !isString(value)
    || value.length > MAX_MEDIA_URL_LENGTH
    || /[\s\\]/.test(value)
  ) {
    return
  }

  try {
    const url = new URL(value)

    if (
      url.protocol !== 'https:'
      || !REPLAY_MEDIA_HOSTS.has(url.hostname)
      || url.username
      || url.password
      || url.port
      || !(
        kind === 'playlist' ? /\.m3u8$/i : /\.(?:ts|m4s|mp4|m4a|cmfv|cmfa)$/i
      ).test(url.pathname)
    ) {
      return
    }

    url.hash = ''

    if (url.href.length <= MAX_MEDIA_URL_LENGTH) {
      return url.href
    }
  } catch {}
}
