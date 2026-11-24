import { isString } from '@ntnyq/utils'

/**
 * Checks that a post identifier is a string containing 1 to 25 decimal digits.
 *
 * @param value - Candidate identifier from an external payload.
 * @returns Whether the value is a supported post identifier.
 */
export function isPostId(value: unknown): value is string {
  return isString(value) && /^\d{1,25}$/.test(value)
}

/**
 * Checks for an HTTPS X or Twitter URL without credentials or a non-default port.
 *
 * @param value - Candidate page URL.
 * @returns Whether the URL belongs to X, Twitter, or one of their subdomains.
 */
export function isXUrl(value: unknown): value is string {
  if (!isString(value)) {
    return false
  }

  try {
    const url = new URL(value)

    return (
      url.protocol === 'https:'
      && /^(?:[\w-]+\.)*(?:x|twitter)\.com$/.test(url.hostname)
      && !url.username
      && !url.password
      && !url.port
    )
  } catch {
    return false
  }
}

/**
 * Extracts a post identifier from an allowed X or Twitter status URL.
 *
 * @param value - Candidate URL, including optional photo or video path suffixes.
 * @returns The string post identifier, or undefined for an unsupported URL.
 */
export function extractPostIdFromUrl(value: unknown): string | undefined {
  if (!isXUrl(value)) {
    return
  }

  return new URL(value).pathname.match(
    /\/(?:status|statuses)\/(\d{1,25})(?:\/|$)/,
  )?.[1]
}

/**
 * Checks that a broadcast ID contains 1 to 40 letters, digits, underscores, or hyphens.
 *
 * @param value - Candidate broadcast identifier from a URL or capture payload.
 * @returns Whether the value is a supported broadcast identifier.
 */
export function isBroadcastId(value: unknown): value is string {
  return isString(value) && /^[\w-]{1,40}$/.test(value)
}

/**
 * Extracts a broadcast identifier from an allowed X or Twitter broadcast URL.
 *
 * @param value - Candidate page URL.
 * @returns The broadcast identifier, or undefined for an unsupported URL.
 */
export function extractBroadcastIdFromUrl(value: unknown): string | undefined {
  if (isXUrl(value)) {
    return new URL(value).pathname.match(
      /^\/i\/broadcasts\/([\w-]{1,40})\/?$/,
    )?.[1]
  }
}
