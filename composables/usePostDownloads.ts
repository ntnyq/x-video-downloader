import { browser } from '#imports'
import { isDownloadStatus } from '~/utils/downloadHistory'
import { localizeDownloadError } from '~/utils/i18n'
import { isRecord } from '~/utils/video'
import type { MaybeRefOrGetter } from 'vue'
import type { DownloadStatus } from '~/types/download'
import type { DownloadRequest } from '~/types/video'

export function usePostDownloads(
  postId?: MaybeRefOrGetter<string>,
  contextKey?: MaybeRefOrGetter<string>,
) {
  const downloads = shallowRef<DownloadStatus[]>([])
  const isPending = shallowRef(false)
  const isActionPending = shallowRef(false)
  const message = shallowRef('')
  const duplicateRequests = shallowRef<DownloadRequest[]>([])

  const requestError = shallowRef('')
  const progressError = shallowRef('')

  let isRefreshing = false
  let isDisposed = false
  let scopeVersion = 0

  /**
   * Loads and validates download progress for the current post.
   * Responses for a previous post or disposed scope cannot replace the current list.
   *
   * @returns A promise that settles after the refresh attempt or an overlapping-call skip.
   */
  async function refresh() {
    if (isRefreshing || isDisposed) {
      return
    }
    isRefreshing = true
    const id = toValue(postId)
    const version = scopeVersion
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
      if (!isDisposed && version === scopeVersion && id === toValue(postId)) {
        // This channel is served only by our background; keep boundary checks
        // for required identity and state before rendering native API data.
        downloads.value = response['downloads']
          .filter(isDownloadStatus)
          .filter(item => id === undefined || item.postId === id)
        progressError.value = ''
      }
    } catch {
      if (!isDisposed && version === scopeVersion && id === toValue(postId)) {
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
   * @param requests - Validated requests for the selected videos across the visible posts.
   * @returns A promise resolving after the batch attempt and progress refresh.
   */
  async function start(requests: DownloadRequest[], force = false) {
    if (!requests.length || isPending.value || isDisposed) {
      return
    }
    const version = scopeVersion
    isPending.value = true
    requestError.value = ''
    duplicateRequests.value = []
    message.value =
      requests.length > 1
        ? i18n.t('creatingDownloads', [requests.length])
        : i18n.t('creatingDownload')
    try {
      const response: unknown = await browser.runtime.sendMessage({
        type: 'download-videos',
        requests,
        force,
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
      if (isDisposed || version !== scopeVersion) {
        return
      }
      const results = response['results'].filter(isRecord)
      const failures = results.filter(
        item => !isRecord(item['result']) || item['result']['ok'] !== true,
      )
      duplicateRequests.value = requests.filter(request =>
        failures.some(
          item =>
            item['postId'] === request.postId
            && item['mediaIndex'] === request.mediaIndex
            && isRecord(item['result'])
            && item['result']['error'] === 'duplicateDownload',
        ),
      )
      message.value = i18n.t('downloadsCreated', [
        results.length - failures.length,
      ])
      const errors = failures.filter(
        item =>
          !isRecord(item['result'])
          || item['result']['error'] !== 'duplicateDownload',
      )
      if (errors.length) {
        requestError.value = errors
          .map(item =>
            i18n.t('postVideoError', [
              String(item['postId']),
              String(item['mediaIndex']),
              localizeDownloadError(
                isRecord(item['result']) ? item['result']['error'] : undefined,
              ),
            ]),
          )
          .join(' · ')
      }
    } catch (error) {
      if (isDisposed || version !== scopeVersion) {
        return
      }
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
  async function action(
    downloadId: number,
    action: 'cancel' | 'retry' | 'pause' | 'resume',
  ) {
    if (isActionPending.value || isDisposed) {
      return
    }
    const version = scopeVersion
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
      if (isDisposed || version !== scopeVersion) {
        return
      }
      message.value =
        action === 'cancel'
          ? i18n.t('downloadCancelled')
          : action === 'pause'
            ? i18n.t('downloadPaused')
            : action === 'resume'
              ? i18n.t('downloadResumed')
              : i18n.t('downloadRetried')
    } catch (error) {
      if (isDisposed || version !== scopeVersion) {
        return
      }
      requestError.value =
        error instanceof Error ? error.message : i18n.t('actionFailed')
    } finally {
      isActionPending.value = false
      await refresh()
    }
  }

  /**
   * Clears only terminal records selected by the history view, without deleting files.
   */
  async function clear(ids: number[]) {
    if (isActionPending.value || !ids.length || isDisposed) {
      return
    }
    const version = scopeVersion
    isActionPending.value = true
    requestError.value = ''
    try {
      const response: unknown = await browser.runtime.sendMessage({
        type: 'clear-downloads',
        ids,
      })
      if (!isRecord(response) || response['ok'] !== true) {
        throw new Error(
          localizeDownloadError(
            isRecord(response) ? response['error'] : 'actionFailed',
          ),
        )
      }
      if (!isDisposed && version === scopeVersion) {
        message.value = i18n.t('historyCleared')
      }
    } catch (error) {
      if (isDisposed || version !== scopeVersion) {
        return
      }
      requestError.value =
        error instanceof Error ? error.message : i18n.t('actionFailed')
    } finally {
      isActionPending.value = false
      await refresh()
    }
  }

  /**
   * Repeats only the completed downloads explicitly confirmed by the user.
   */
  function confirmDuplicates() {
    return start([...duplicateRequests.value], true)
  }

  /**
   * Dismisses the pending repeat-download choice.
   */
  function dismissDuplicates() {
    duplicateRequests.value = []
  }

  watch(
    [() => toValue(postId), () => toValue(contextKey)],
    () => {
      scopeVersion++
      downloads.value = []
      duplicateRequests.value = []
      message.value = ''
      requestError.value = ''
      progressError.value = ''
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
    clear,
    duplicateRequests: readonly(duplicateRequests),
    confirmDuplicates,
    dismissDuplicates,
  }
}
