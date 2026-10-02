import { storage } from '#imports'
import { DEFAULT_FILENAME_TEMPLATE, normalizePreferences } from './preferences'
import type { DownloadRecord, QualityPreference } from '~/types/download'

export const saveAsSetting = storage.defineItem<boolean>('local:saveAs', {
  fallback: true,
})
export const qualitySetting = storage.defineItem<QualityPreference>(
  'local:quality',
  { fallback: 'highest' },
)
export const filenameSetting = storage.defineItem<string>(
  'local:filenameTemplate',
  { fallback: DEFAULT_FILENAME_TEMPLATE },
)
export const downloadRecords = storage.defineItem<DownloadRecord[]>(
  'local:downloadRecords',
  { fallback: [] },
)

export async function getDownloadPreferences() {
  const [saveAs, quality, filenameTemplate] = await Promise.all([
    saveAsSetting.getValue(),
    qualitySetting.getValue(),
    filenameSetting.getValue(),
  ])
  return normalizePreferences({ saveAs, quality, filenameTemplate })
}
