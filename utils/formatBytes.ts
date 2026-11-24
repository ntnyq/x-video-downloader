import { convertFromBytes, STORAGE_UNITS } from '@ntnyq/utils'

/**
 * Formats byte counts using binary B, KB, and MB thresholds.
 *
 * @param bytes - Byte count; negative or non-finite values indicate an unknown size.
 * @param unknownLabel - Localized text to display when the size is unknown.
 * @returns The formatted size or the supplied unknown-size label.
 */
export function formatBytes(
  bytes: number,
  unknownLabel = 'Unknown size',
): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return unknownLabel
  }

  if (bytes < STORAGE_UNITS.KB) {
    return `${bytes} B`
  }

  if (bytes < STORAGE_UNITS.MB) {
    return `${convertFromBytes(bytes, 'KB').toFixed(1)} KB`
  }

  return `${convertFromBytes(bytes, 'MB').toFixed(1)} MB`
}
