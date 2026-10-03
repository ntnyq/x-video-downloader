import { createSharedComposable } from '@vueuse/core'
import { getThemeStyle, normalizeTheme } from '~/utils/theme'
import { themeSetting } from '~/utils/themeSetting'

/**
 * Shares the saved accent and storage subscription within an extension context.
 */
export const useTheme = createSharedComposable(() => {
  const theme = shallowRef('grok')
  const isReady = shallowRef(false)
  const isSaving = shallowRef(false)
  const themeError = shallowRef('')

  let hasChanged = false
  let isDisposed = false

  const stop = themeSetting.watch(value => {
    hasChanged = true
    theme.value = normalizeTheme(value)
  })

  themeSetting
    .getValue()
    .then(value => {
      if (!isDisposed && !hasChanged) {
        theme.value = normalizeTheme(value)
      }
      isReady.value = true
    })
    .catch(() => {
      themeError.value = i18n.t('themeReadFailed')
      isReady.value = true
    })

  /**
   * Persists a validated theme and updates this context only after storage succeeds.
   *
   * @param value - Selected preset or validated RGB input.
   * @returns Whether the preference was saved successfully.
   */
  async function saveTheme(value: string): Promise<boolean> {
    if (!isReady.value || isSaving.value) {
      return false
    }
    isSaving.value = true
    themeError.value = ''
    try {
      const nextTheme = normalizeTheme(value)
      await themeSetting.setValue(nextTheme)
      theme.value = nextTheme
      return true
    } catch {
      themeError.value = i18n.t('settingsSaveFailed')
      return false
    } finally {
      isSaving.value = false
    }
  }

  onScopeDispose(() => {
    isDisposed = true
    stop()
  })

  return {
    theme: readonly(theme),
    themeStyle: computed(() => getThemeStyle(theme.value)),
    isReady: readonly(isReady),
    isSaving: readonly(isSaving),
    themeError: readonly(themeError),
    saveTheme,
  }
})
