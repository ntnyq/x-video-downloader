import { storage } from '#imports'
import {
  DEFAULT_CONCURRENCY,
  DEFAULT_DOWNLOAD_BUTTON_POSITION,
  DEFAULT_FILENAME_TEMPLATE,
  DEFAULT_QUALITY,
} from '../../constants/preferences'
import { normalizePreferences } from '../download/preferences'
import type {
  DownloadButtonPosition,
  QualityPreference,
} from '../../types/download'

/**
 * Preference for prompting the user to choose a location for each download.
 */
export const saveAsSetting = storage.defineItem<boolean>('local:saveAs', {
  fallback: false,
})
/**
 * Preference for enabling the post download icon with click and double-click actions.
 */
export const newUiSetting = storage.defineItem<boolean>('local:useNewUi', {
  fallback: false,
})
/**
 * Placement of the opt-in download icon in a post.
 */
export const downloadButtonPositionSetting =
  storage.defineItem<DownloadButtonPosition>('local:downloadButtonPosition', {
    fallback: DEFAULT_DOWNLOAD_BUTTON_POSITION,
  })
/**
 * Maximum number of downloads the queue can start concurrently.
 */
export const concurrencySetting = storage.defineItem<number>(
  'local:concurrency',
  {
    fallback: DEFAULT_CONCURRENCY,
  },
)
/**
 * Default quality preference used when the user has no explicit rendition selection.
 */
export const qualitySetting = storage.defineItem<QualityPreference>(
  'local:quality',
  { fallback: DEFAULT_QUALITY },
)
/**
 * User-defined template for generating MP4 filenames.
 */
export const filenameSetting = storage.defineItem<string>(
  'local:filenameTemplate',
  { fallback: DEFAULT_FILENAME_TEMPLATE },
)

/**
 * Reads all download settings and normalizes invalid or missing stored values.
 *
 * @returns A promise resolving to the effective download preferences.
 * @throws When reading any setting from extension storage fails.
 */
export async function getDownloadPreferences() {
  const [
    saveAs,
    quality,
    filenameTemplate,
    concurrency,
    useNewUi,
    downloadButtonPosition,
  ] = await Promise.all([
    saveAsSetting.getValue(),
    qualitySetting.getValue(),
    filenameSetting.getValue(),
    concurrencySetting.getValue(),
    newUiSetting.getValue(),
    downloadButtonPositionSetting.getValue(),
  ])

  return normalizePreferences({
    saveAs,
    quality,
    filenameTemplate,
    concurrency,
    useNewUi,
    downloadButtonPosition,
  })
}
