import { isBoolean, isInteger, isNumber, isString } from '@ntnyq/utils'
import {
  DEFAULT_CONCURRENCY,
  DEFAULT_DOWNLOAD_BUTTON_POSITION,
  DEFAULT_FILENAME_TEMPLATE,
  DEFAULT_QUALITY,
  MAX_CONCURRENCY,
  QUALITY_OPTIONS,
} from '../../constants/preferences'
import { isRecord } from '../isRecord'
import { validateFilenameTemplate } from './filename'
import type {
  DownloadButtonPosition,
  DownloadPreferences,
  QualityPreference,
} from '../../types/download'

/**
 * Accepts an integer transfer limit from 1 to 6, otherwise using the default.
 *
 * @param value - Untrusted concurrency setting.
 * @returns A supported transfer limit.
 */
export function normalizeConcurrency(value: unknown): number {
  return isNumber(value)
    && isInteger(value)
    && value >= 1
    && value <= MAX_CONCURRENCY
    ? value
    : DEFAULT_CONCURRENCY
}

/**
 * Resolves a stored quality value to a supported preference.
 *
 * @param value - Untrusted quality value from storage or a form control.
 * @returns The supported preference, falling back to highest quality.
 */
export function normalizeQuality(value: unknown): QualityPreference {
  return (
    QUALITY_OPTIONS.find(option => option.value === value)?.value
    ?? DEFAULT_QUALITY
  )
}

/**
 * Resolves the stored icon placement, defaulting to the action row.
 */
export function normalizeDownloadButtonPosition(
  value: unknown,
): DownloadButtonPosition {
  return value === 'postHeader' ? value : DEFAULT_DOWNLOAD_BUTTON_POSITION
}

/**
 * Validates stored preferences and supplies safe defaults for invalid fields.
 *
 * @param value - Untrusted preferences read from extension storage.
 * @returns Preferences with a valid quality, filename template, and save-dialog flag.
 */
export function normalizePreferences(value: unknown): DownloadPreferences {
  const input = isRecord(value) ? value : {}
  const template = input['filenameTemplate']

  return {
    concurrency: normalizeConcurrency(input['concurrency']),
    downloadButtonPosition: normalizeDownloadButtonPosition(
      input['downloadButtonPosition'],
    ),
    saveAs: isBoolean(input['saveAs']) ? input['saveAs'] : false,
    useNewUi: input['useNewUi'] === true,
    quality: normalizeQuality(input['quality']),
    filenameTemplate:
      isString(template) && !validateFilenameTemplate(template)
        ? template
        : DEFAULT_FILENAME_TEMPLATE,
  }
}
