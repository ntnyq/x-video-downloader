import { createSharedComposable } from '@vueuse/core'
import { normalizePreferences } from '~/utils/preferences'
import {
  filenameSetting,
  getDownloadPreferences,
  qualitySetting,
  saveAsSetting,
} from '~/utils/settings'

export const useDownloadPreferences = createSharedComposable(() => {
  const preferences = shallowRef(normalizePreferences({}))
  const isReady = shallowRef(false)
  const preferenceError = shallowRef('')

  const changed = new Set<string>()

  const stops = [
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
      preferences.value = {
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
      preferenceError.value = i18n.t('preferencesReadFailed')
    })

  onScopeDispose(() => {
    stops.forEach(stop => stop())
  })

  return {
    preferences: readonly(preferences),
    isReady: readonly(isReady),
    preferenceError: readonly(preferenceError),
  }
})
