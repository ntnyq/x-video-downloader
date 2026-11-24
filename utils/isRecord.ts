import { isArray, isNull } from '@ntnyq/utils'

/**
 * Checks that a page message is a non-null object, excluding arrays and functions.
 * The guard from `@ntnyq/utils` also accepts functions, so it cannot serve this boundary.
 *
 * @param value - Untrusted value received from a page or browser message.
 * @returns Whether the value can be inspected as a string-keyed object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && !isNull(value) && !isArray(value)
}
