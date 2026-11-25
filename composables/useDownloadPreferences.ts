import { createSharedComposable } from '@vueuse/core'
import { normalizePreferences } from '~/utils/download/preferences'
import { stopExtensionListener } from '~/utils/extension/context'
import {
  concurrencySetting,
  downloadButtonPositionSetting,
  filenameSetting,
  getDownloadPreferences,
  newUiSetting,
  qualitySetting,
  saveAsSetting,
} from '~/utils/storage/downloadPreferences'

export const useDownloadPreferences = createSharedComposable(() => {
  const preferences = shallowRef(normalizePreferences({}))
  const isReady = shallowRef(false)
  const preferenceError = shallowRef('')

  const changed = new Set<string>()
  let isDisposed = false

  const stops = [
    downloadButtonPositionSetting.watch(downloadButtonPosition => {
      changed.add('downloadButtonPosition')
      preferences.value = normalizePreferences({
        ...preferences.value,
        downloadButtonPosition,
      })
    }),
    newUiSetting.watch(useNewUi => {
      changed.add('useNewUi')
      preferences.value = normalizePreferences({
        ...preferences.value,
        useNewUi,
      })
    }),
    concurrencySetting.watch(concurrency => {
      changed.add('concurrency')
      preferences.value = normalizePreferences({
        ...preferences.value,
        concurrency,
      })
    }),
    saveAsSetting.watch(saveAs => {
      changed.add('saveAs')
      preferences.value = { ...preferences.value, saveAs }
    }),
    qualitySetting.watch(quality => {
      changed.add('quality')
      preferences.value = normalizePreferences({
        ...preferences.value,
        quality,
      })
    }),
    filenameSetting.watch(filenameTemplate => {
      changed.add('filenameTemplate')
      preferences.value = normalizePreferences({
        ...preferences.value,
        filenameTemplate,
      })
    }),
  ]

  getDownloadPreferences()
    .then(value => {
      if (isDisposed) {
        return
      }

      preferences.value = {
        downloadButtonPosition: changed.has('downloadButtonPosition')
          ? preferences.value.downloadButtonPosition
          : value.downloadButtonPosition,
        useNewUi: changed.has('useNewUi')
          ? preferences.value.useNewUi
          : value.useNewUi,
        concurrency: changed.has('concurrency')
          ? preferences.value.concurrency
          : value.concurrency,
        saveAs: changed.has('saveAs') ? preferences.value.saveAs : value.saveAs,
        quality: changed.has('quality')
          ? preferences.value.quality
          : value.quality,
        filenameTemplate: changed.has('filenameTemplate')
          ? preferences.value.filenameTemplate
          : value.filenameTemplate,
      }
      isReady.value = true
    })
    .catch(() => {
      if (!isDisposed) {
        preferenceError.value = i18n.t('settings.readFailed')
      }
    })

  onScopeDispose(() => {
    isDisposed = true
    stops.forEach(stopExtensionListener)
  })

  return {
    preferences: readonly(preferences),
    isReady: readonly(isReady),
    preferenceError: readonly(preferenceError),
  }
})
