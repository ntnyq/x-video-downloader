import { createSharedComposable } from '@vueuse/core'
import { DEFAULT_THEME } from '~/constants/theme'
import { stopExtensionListener } from '~/utils/extension/context'
import { themeSetting } from '~/utils/storage/themeSetting'
import { getThemeStyle, normalizeTheme } from '~/utils/ui/theme'

/**
 * Shares the saved accent and storage subscription within an extension context.
 */
export const useTheme = createSharedComposable(() => {
  const theme = shallowRef<string>(DEFAULT_THEME)
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
      if (isDisposed) {
        return
      }

      if (!hasChanged) {
        theme.value = normalizeTheme(value)
      }

      isReady.value = true
    })
    .catch(() => {
      if (!isDisposed) {
        themeError.value = i18n.t('theme.readFailed')
        isReady.value = true
      }
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
      themeError.value = i18n.t('settings.saveFailed')

      return false
    } finally {
      isSaving.value = false
    }
  }

  onScopeDispose(() => {
    isDisposed = true
    stopExtensionListener(stop)
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
