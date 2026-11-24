import type { ReplayRenditionRetry } from '~/utils/replay/playlist'

/**
 * Signals that another page already holds the replay task lock.
 */
export class ReplayBusyError extends Error {
  override name = 'ReplayBusyError'
}

/**
 * Signals that a replay playlist or media resource could not be fetched.
 */
export class ReplayFetchError extends Error {
  override name = 'ReplayFetchError'
}

/**
 * Signals that the browser could not complete the native download.
 */
export class ReplaySaveError extends Error {
  override name = 'ReplaySaveError'
}

/**
 * Signals that the replay assembly worker exceeded its idle deadline.
 */
export class ReplayStalledError extends Error {
  override name = 'ReplayStalledError'
}

/**
 * Signals a user cancellation from the replay page or the native download.
 */
export class ReplayCancelledError extends Error {
  override name = 'ReplayCancelledError'
}

/**
 * Carries segment failure details and any available retry rendition.
 */
export class ReplaySegmentError extends Error {
  override name = 'ReplaySegmentError'
  /**
   * One-based segment number, when the failing segment can be identified.
   */
  readonly segment: number | undefined
  /**
   * Alternative rendition available for a new attempt.
   */
  readonly retry?: ReplayRenditionRetry

  /**
   * @param segment - One-based index of the failing segment, if known.
   * @param retry - Alternative rendition, if one is available.
   * @param options - Error options carrying the original failure.
   */
  constructor(
    segment: number | undefined,
    retry: ReplayRenditionRetry | undefined,
    options: ErrorOptions,
  ) {
    super(
      segment === undefined
        ? 'Could not assemble replay segments'
        : `Could not process replay segment ${segment}`,
      options,
    )
    this.segment = segment
    this.retry = retry
  }
}
