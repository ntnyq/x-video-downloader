import { storage } from '#imports'
import {
  DEFAULT_CONCURRENCY,
  DEFAULT_FILENAME_TEMPLATE,
  DEFAULT_QUALITY,
} from '../constants/preferences'
import { normalizePreferences } from './preferences'
import type { DownloadRecord, QualityPreference } from '~/types/download'

export const saveAsSetting = storage.defineItem<boolean>('local:saveAs', {
  fallback: false,
})
export const concurrencySetting = storage.defineItem<number>(
  'local:concurrency',
  {
    fallback: DEFAULT_CONCURRENCY,
  },
)
export const qualitySetting = storage.defineItem<QualityPreference>(
  'local:quality',
  { fallback: DEFAULT_QUALITY },
)
export const filenameSetting = storage.defineItem<string>(
  'local:filenameTemplate',
  { fallback: DEFAULT_FILENAME_TEMPLATE },
)
export const downloadRecords = storage.defineItem<DownloadRecord[]>(
  'local:downloadRecords',
  { fallback: [] },
)

/**
 * Reads all download settings and normalizes invalid or missing stored values.
 *
 * @returns A promise resolving to the effective download preferences.
 * @throws When reading any setting from extension storage fails.
 */
export async function getDownloadPreferences() {
  const [saveAs, quality, filenameTemplate, concurrency] = await Promise.all([
    saveAsSetting.getValue(),
    qualitySetting.getValue(),
    filenameSetting.getValue(),
    concurrencySetting.getValue(),
  ])
  return normalizePreferences({
    saveAs,
    quality,
    filenameTemplate,
    concurrency,
  })
}
