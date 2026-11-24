import { ReplayStorageError } from './errors'

/**
 * Budgets replay storage while leaving room for the output, worker files, and filesystem overhead.
 *
 * @param estimate - Storage quota and usage estimate reported by the browser.
 * @param estimate.quota - Estimated capacity of the origin's storage in bytes.
 * @param estimate.usage - Estimated bytes already in use, including staged input when present.
 * @param staged - Whether the replay input already contributes to the reported usage.
 * @returns The maximum input size in bytes that fits the remaining working-space budget.
 * @throws {ReplayStorageError} When the browser estimate is missing or invalid.
 */
export function getReplayStorageBudget(
  { quota, usage }: StorageEstimate,
  staged = false,
) {
  if (
    typeof quota !== 'number'
    || typeof usage !== 'number'
    || !Number.isFinite(quota)
    || !Number.isFinite(usage)
    || quota < 0
    || usage < 0
  ) {
    throw new ReplayStorageError()
  }

  // The reported usage already includes the input after staging.
  const copies = staged ? 3 : 4

  return Math.floor(Math.max(0, quota - usage) / copies)
}

/**
 * Detects a quota error from the browser, including errors wrapped during worker cleanup.
 *
 * @param error - Failure reported while staging or assembling a replay.
 * @returns Whether the error or a nested aggregate member indicates an exceeded quota.
 */
export function isReplayQuotaError(error: unknown): boolean {
  return (
    error instanceof Error
    && (error.name === 'QuotaExceededError'
      || (error instanceof AggregateError
        && error.errors.some(isReplayQuotaError)))
  )
}
