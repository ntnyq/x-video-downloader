import { browser } from '#imports'
import { isRecord, isXUrl, normalizePost } from '~/utils/video'
import type { PageVideos } from '~/types/video'

export function useCurrentTabVideos() {
  const snapshot = shallowRef<PageVideos>({ posts: [], captureReady: false })
  const isLoading = shallowRef(true)
  const requestError = shallowRef('')
  let tabId: number | undefined
  let isRefreshing = false

  async function refresh() {
    if (tabId === undefined || isRefreshing) {
      return
    }
    isRefreshing = true
    try {
      const result: unknown = await browser.tabs.sendMessage(tabId, {
        type: 'get-page-videos',
      })
      if (!isRecord(result) || !Array.isArray(result['posts'])) {
        throw new Error('invalid-response')
      }
      snapshot.value = {
        posts: result['posts'].flatMap(item => normalizePost(item) ?? []),
        captureReady: result['captureReady'] === true,
      }
      requestError.value = ''
    } catch {
      requestError.value = i18n.t('pageDisconnected')
    } finally {
      isLoading.value = false
      isRefreshing = false
    }
  }

  onMounted(async () => {
    try {
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      })
      if (!isXUrl(tab?.url) || tab?.id === undefined) {
        requestError.value = i18n.t('openPostFirst')
        return
      }
      tabId = tab.id
      await refresh()
    } catch {
      requestError.value = i18n.t('tabReadFailed')
    } finally {
      isLoading.value = false
    }
  })
  const { pause } = useIntervalFn(refresh, 1500)
  onUnmounted(pause)
  return { snapshot, isLoading, requestError, refresh }
}
