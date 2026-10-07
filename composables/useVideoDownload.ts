import { browser } from '#imports'
import { localizeDownloadError } from '~/utils/i18n'
import { isRecord } from '~/utils/video'
import type { MaybeRefOrGetter } from 'vue'
import type { DownloadRequest } from '~/types/video'

export function useVideoDownload(
  contextKey?: MaybeRefOrGetter<string | undefined>,
) {
  const isPending = shallowRef(false)
  const message = shallowRef('')
  const hasError = shallowRef(false)
  const duplicateRequest = shallowRef<DownloadRequest>()
  let isDisposed = false
  let scopeVersion = 0

  /**
   * Requests a single download and updates the pending, success, and error state.
   *
   * @param request - Validated request for the selected MP4 version.
   * @returns True when queued, false on failure, or undefined while another request is pending.
   */
  async function download(request: DownloadRequest, force = false) {
    if (isPending.value || isDisposed) {
      return
    }
    const version = scopeVersion
    isPending.value = true
    hasError.value = false
    duplicateRequest.value = undefined
    message.value = i18n.t('creatingSave')
    try {
      const result: unknown = await browser.runtime.sendMessage({
        ...request,
        force,
      })
      if (isDisposed || version !== scopeVersion) {
        return false
      }
      if (
        isRecord(result)
        && result['ok'] === false
        && result['error'] === 'duplicateDownload'
      ) {
        duplicateRequest.value = request
        message.value = ''
        return false
      }
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
      if (isDisposed || version !== scopeVersion) {
        return false
      }
      hasError.value = true
      message.value =
        error instanceof Error ? error.message : i18n.t('downloadFailed')
      return false
    } finally {
      isPending.value = false
    }
  }

  watch(
    () => toValue(contextKey),
    () => {
      scopeVersion++
      duplicateRequest.value = undefined
      message.value = ''
      hasError.value = false
    },
  )
  onScopeDispose(() => {
    isDisposed = true
  })

  return {
    isPending,
    message,
    hasError,
    download,
    duplicateRequest,
  }
}
