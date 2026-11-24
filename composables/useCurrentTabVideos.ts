import { isArray, isUndefined } from '@ntnyq/utils'
import { browser } from '#imports'
import { PAGE_VIDEOS_REFRESH_INTERVAL_MS } from '~/constants/video'
import { isRecord } from '~/utils/isRecord'
import { isXUrl } from '~/utils/video/identity'
import { normalizePost } from '~/utils/video/posts'
import type { PageVideos } from '~/types/video'

export function useCurrentTabVideos() {
  const snapshot = shallowRef<PageVideos>({
    posts: [],
    captureReady: false,
  })
  const isLoading = shallowRef(true)
  const requestError = shallowRef('')
  const isDisconnected = shallowRef(false)

  let tabId: number | undefined
  let isRefreshing = false

  /**
   * Refreshes the active X tab's captured videos while avoiding overlapping requests.
   * Failures update the localized request error and always release the loading state.
   *
   * @returns A promise that settles after the refresh, or immediately when unavailable or busy.
   */
  async function refresh() {
    if (isUndefined(tabId) || isRefreshing) {
      return
    }

    isRefreshing = true

    try {
      const result: unknown = await browser.tabs.sendMessage(tabId, {
        type: 'get-page-videos',
      })

      if (!isRecord(result) || !isArray(result['posts'])) {
        throw new Error('invalid-response')
      }

      snapshot.value = {
        posts: result['posts'].flatMap(item => normalizePost(item) ?? []),
        captureReady: result['captureReady'] === true,
      }
      requestError.value = ''
      isDisconnected.value = false
    } catch {
      snapshot.value = { posts: [], captureReady: false }
      requestError.value = i18n.t('page.disconnected')
      isDisconnected.value = true
    } finally {
      isLoading.value = false
      isRefreshing = false
    }
  }

  /**
   * Reloads the selected X tab so Chrome can inject the current content scripts.
   */
  async function reloadTab() {
    if (isUndefined(tabId) || !isDisconnected.value) {
      return
    }

    isLoading.value = true

    try {
      await browser.tabs.reload(tabId)
      await refresh()
    } catch {
      isLoading.value = false
    }
  }

  const { pause } = useIntervalFn(refresh, PAGE_VIDEOS_REFRESH_INTERVAL_MS)

  onMounted(async () => {
    try {
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      })

      if (!isXUrl(tab?.url) || isUndefined(tab?.id)) {
        requestError.value = i18n.t('page.openPostFirst')

        return
      }

      tabId = tab.id
      await refresh()
    } catch {
      requestError.value = i18n.t('page.readFailed')
    } finally {
      isLoading.value = false
    }
  })
  onUnmounted(() => {
    pause()
  })

  return {
    snapshot,
    isLoading,
    requestError,
    isDisconnected,

    refresh,
    reloadTab,
  }
}
