import { ReplayFormatError, ReplayLimitError } from '~/utils/replay/errors'
import { decodeReplayPlaylist } from '~/utils/replay/playlist'
import { startIdleTimeout } from './idleTimeout'
import { ReplayFetchError } from './replayErrors'

/**
 * Maximum response body size in bytes for an HLS playlist.
 */
const MAX_PLAYLIST_BYTES = 1024 * 1024

/**
 * Maximum response body size in bytes for one initialization or media segment.
 */
const MAX_SEGMENT_BYTES = 16 * 1024 * 1024

/**
 * Maximum idle time in milliseconds per request attempt.
 * The timer resets on a 200 response with a body and after each body chunk.
 */
const REQUEST_IDLE_TIMEOUT = 20_000

/**
 * HTTP response statuses eligible for a retry within the request attempt limit.
 */
const TRANSIENT_STATUSES = new Set([408, 429, 500, 502, 503, 504])

/**
 * Streams a validated replay URL within a byte limit, retrying transient failures.
 *
 * @param url - Playlist or media URL already validated by capture or playlist parsing.
 * @param limit - Maximum number of response bytes to accept.
 * @param signal - Signal used to cancel the request and any retries.
 * @returns The complete response body.
 * @throws {ReplayFetchError} When the request fails or returns an unusable response.
 * @throws {ReplayLimitError} When the declared or received body exceeds the limit.
 */
async function fetchBytes(url: string, limit: number, signal: AbortSignal) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const request = startIdleTimeout(signal, REQUEST_IDLE_TIMEOUT)

    try {
      const response = await fetch(url, {
        signal: request.signal,
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
      })

      if (response.status !== 200 || !response.body) {
        if (TRANSIENT_STATUSES.has(response.status) && attempt < 2) {
          continue
        }

        throw new ReplayFetchError()
      }

      request.reset()

      if (Number(response.headers.get('content-length')) > limit) {
        throw new ReplayLimitError()
      }

      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let length = 0

      while (true) {
        const { value, done } = await reader.read()

        if (done) {
          break
        }

        request.reset()
        length += value.byteLength

        if (length > limit) {
          throw new ReplayLimitError()
        }

        chunks.push(value)
      }

      const bytes = new Uint8Array(length)
      let offset = 0

      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
      }

      return bytes
    } catch (error) {
      signal.throwIfAborted()

      if (
        error instanceof ReplayLimitError
        || error instanceof ReplayFetchError
      ) {
        throw error
      }

      if (attempt === 2) {
        throw new ReplayFetchError()
      }
    } finally {
      request.dispose()
    }
  }

  throw new ReplayFetchError()
}

/**
 * Fetches and validates an initialization segment or media segment.
 *
 * @param url - Media URL resolved and validated by the playlist parser.
 * @param signal - Signal used to cancel the request and any retries.
 * @param validate - Validator for the expected media format.
 * @param retryMalformed - Whether a format error triggers one additional fetch.
 * @returns The validated media bytes.
 * @throws {ReplayFormatError} When validation fails after any allowed retry.
 */
export async function fetchReplayResource(
  url: string,
  signal: AbortSignal,
  validate: (bytes: Uint8Array) => void,
  retryMalformed = true,
) {
  const bytes = await fetchBytes(url, MAX_SEGMENT_BYTES, signal)

  try {
    validate(bytes)

    return bytes
  } catch (error) {
    if (!retryMalformed || !(error instanceof ReplayFormatError)) {
      throw error
    }
  }

  // Retry malformed responses once before staging them.
  const retry = await fetchBytes(url, MAX_SEGMENT_BYTES, signal)

  validate(retry)

  return retry
}

/**
 * Fetches an HLS playlist within the playlist byte limit and decodes its UTF-8 text.
 *
 * @param url - Playlist URL validated by capture or master playlist parsing.
 * @param signal - Signal used to cancel the request and any retries.
 * @returns The decoded playlist text.
 * @throws {ReplayFormatError} When the playlist text is invalid UTF-8.
 */
export async function fetchReplayPlaylist(url: string, signal: AbortSignal) {
  return decodeReplayPlaylist(await fetchBytes(url, MAX_PLAYLIST_BYTES, signal))
}
