import { browser } from '#imports'
import { localizeDownloadError } from '~/utils/i18n'
import { isRecord } from '~/utils/video'
import type { DownloadRequest } from '~/types/video'

export function useVideoDownload() {
  const isPending = shallowRef(false)
  const message = shallowRef('')
  const hasError = shallowRef(false)

  async function download(request: DownloadRequest) {
    if (isPending.value) {
      return
    }
    isPending.value = true
    hasError.value = false
    message.value = i18n.t('creatingSave')
    try {
      const result: unknown = await browser.runtime.sendMessage(request)
      if (!isRecord(result) || result['ok'] !== true) {
        throw new Error(
          isRecord(result) && typeof result['error'] === 'string'
            ? localizeDownloadError(result['error'])
            : i18n.t('downloadReload'),
        )
      }
      message.value = i18n.t('downloadQueued')
      return true
    } catch (error) {
      hasError.value = true
      message.value =
        error instanceof Error ? error.message : i18n.t('downloadFailed')
      return false
    } finally {
      isPending.value = false
    }
  }
  return { isPending, message, hasError, download }
}
