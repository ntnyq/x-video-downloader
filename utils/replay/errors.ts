/**
 * Signals an invalid or unsupported replay playlist or media format.
 */
export class ReplayFormatError extends Error {
  override name = 'ReplayFormatError'
}

/**
 * Signals that a replay resource or playlist exceeds a processing limit.
 */
export class ReplayLimitError extends Error {
  override name = 'ReplayLimitError'
}

/**
 * Signals unavailable or insufficient temporary storage for a replay task.
 */
export class ReplayStorageError extends Error {
  override name = 'ReplayStorageError'
}

/**
 * Signals an event playlist or a media playlist without an end marker.
 */
export class ReplayUnfinishedError extends Error {
  override name = 'ReplayUnfinishedError'
}
