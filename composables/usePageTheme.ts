import {
  createSharedComposable,
  useMutationObserver,
  usePreferredDark,
} from '@vueuse/core'

/**
 * Follows X's visible page background without reading account or site storage.
 */
export const usePageTheme = createSharedComposable(() => {
  const prefersDark = usePreferredDark()
  const pageTheme = shallowRef('light')

  /**
   * Resolves light, dim, or black surfaces from the page's computed background.
   */
  function update() {
    const background = [document.body, document.documentElement]
      .map(element => getComputedStyle(element).backgroundColor)
      .find(color => color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent')
    const channels = background
      ?.match(/[\d.]+/g)
      ?.slice(0, 3)
      .map(Number)
    if (!channels || channels.length !== 3) {
      pageTheme.value = prefersDark.value ? 'dark' : 'light'
      return
    }
    const brightness = Math.max(...channels)
    pageTheme.value =
      brightness > 128 ? 'light' : brightness > 20 ? 'dim' : 'dark'
  }

  useMutationObserver(
    [document.body, document.documentElement],
    () => {
      update()
    },
    {
      attributes: true,
      attributeFilter: ['style', 'class', 'data-theme'],
    },
  )
  watch(
    prefersDark,
    () => {
      update()
    },
    { immediate: true },
  )

  return readonly(pageTheme)
})
