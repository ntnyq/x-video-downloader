import { browser } from '#imports'
import { localizeDownloadError } from '~/utils/i18n'
import { isRecord } from '~/utils/video'
import type { MaybeRefOrGetter } from 'vue'
import type { DownloadStatus } from '~/types/download'
import type { DownloadRequest } from '~/types/video'

export function usePostDownloads(postId: MaybeRefOrGetter<string>) {
  const downloads = shallowRef<DownloadStatus[]>([])
  const isPending = shallowRef(false)
  const isActionPending = shallowRef(false)
  const message = shallowRef('')

  const requestError = shallowRef('')
  const progressError = shallowRef('')

  let isRefreshing = false
  let isDisposed = false

  /**
   * Loads and validates download progress for the current post.
   * Responses for a previous post or disposed scope cannot replace the current list.
   *
   * @returns A promise that settles after the refresh attempt or an overlapping-call skip.
   */
  async function refresh() {
    if (isRefreshing) {
      return
    }
    isRefreshing = true
    const id = toValue(postId)
    try {
      const response: unknown = await browser.runtime.sendMessage({
        type: 'get-downloads',
        postId: id,
      })
      if (
        !isRecord(response)
        || response['ok'] !== true
        || !Array.isArray(response['downloads'])
      ) {
        throw new Error(i18n.t('progressReadFailed'))
      }
      if (!isDisposed && id === toValue(postId)) {
        // This channel is served only by our background; keep boundary checks
        // for required identity and state before rendering native API data.
        downloads.value = response['downloads'].filter(
          (item): item is DownloadStatus =>
            isRecord(item)
            && typeof item['id'] === 'number'
            && item['postId'] === id
            && typeof item['filename'] === 'string'
            && typeof item['mediaIndex'] === 'number'
            && typeof item['bytesReceived'] === 'number'
            && typeof item['totalBytes'] === 'number'
            && [
              'in_progress',
              'complete',
              'interrupted',
              'cancelled',
              'paused',
              'missing',
            ].includes(String(item['state'])),
        )
        progressError.value = ''
      }
    } catch {
      if (!isDisposed) {
        progressError.value = i18n.t('progressReadFailed')
      }
    } finally {
      isRefreshing = false
    }
  }

  /**
   * Starts selected downloads and reports individual batch failures in the UI.
   * The progress list is refreshed after every attempted batch.
   *
   * @param requests - Validated requests for the selected videos in one post.
   * @returns A promise resolving after the batch attempt and progress refresh.
   */
  async function start(requests: DownloadRequest[]) {
    if (!requests.length || isPending.value) {
      return
    }
    isPending.value = true
    requestError.value = ''
    message.value =
      requests.length > 1
        ? i18n.t('creatingDownloads', [requests.length])
        : i18n.t('creatingDownload')
    try {
      const response: unknown = await browser.runtime.sendMessage({
        type: 'download-videos',
        requests,
      })
      if (
        !isRecord(response)
        || response['ok'] !== true
        || !Array.isArray(response['results'])
      ) {
        throw new Error(
          isRecord(response) && typeof response['error'] === 'string'
            ? localizeDownloadError(response['error'])
            : i18n.t('downloadFailed'),
        )
      }
      const failures = response['results']
        .filter(isRecord)
        .filter(
          item => !isRecord(item['result']) || item['result']['ok'] !== true,
        )
      message.value = i18n.t('downloadsCreated', [
        response['results'].length - failures.length,
      ])
      if (failures.length) {
        requestError.value = failures
          .map(item =>
            i18n.t('videoError', [
              String(item['mediaIndex']),
              localizeDownloadError(
                isRecord(item['result']) ? item['result']['error'] : undefined,
              ),
            ]),
          )
          .join(' · ')
      }
    } catch (error) {
      requestError.value =
        error instanceof Error ? error.message : i18n.t('downloadFailed')
      message.value = ''
    } finally {
      isPending.value = false
      await refresh()
    }
  }

  /**
   * Cancels or retries an owned download and refreshes its progress.
   * Concurrent actions are ignored and browser failures become localized UI errors.
   *
   * @param downloadId - Browser identifier of the owned download.
   * @param action - Whether to cancel the transfer or retry its original request.
   * @returns A promise resolving after the action attempt and progress refresh.
   */
  async function action(downloadId: number, action: 'cancel' | 'retry') {
    if (isActionPending.value) {
      return
    }
    isActionPending.value = true
    requestError.value = ''
    try {
      const response: unknown = await browser.runtime.sendMessage({
        type: 'download-action',
        downloadId,
        action,
      })
      if (!isRecord(response) || response['ok'] !== true) {
        throw new Error(
          isRecord(response) && typeof response['error'] === 'string'
            ? localizeDownloadError(response['error'])
            : i18n.t('actionFailed'),
        )
      }
      message.value =
        action === 'cancel'
          ? i18n.t('downloadCancelled')
          : i18n.t('downloadRetried')
    } catch (error) {
      requestError.value =
        error instanceof Error ? error.message : i18n.t('actionFailed')
    } finally {
      isActionPending.value = false
      await refresh()
    }
  }

  watch(
    () => toValue(postId),
    () => {
      downloads.value = []
      refresh()
    },
    { immediate: true },
  )
  useIntervalFn(() => {
    refresh()
  }, 1000)

  onScopeDispose(() => {
    isDisposed = true
  })

  return {
    downloads,
    isPending,
    isActionPending,
    message,
    requestError,
    progressError,
    start,
    action,
    refresh,
  }
}
