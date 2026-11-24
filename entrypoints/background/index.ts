import {
  isArray,
  isBoolean,
  isNumber,
  isString,
  isUndefined,
} from '@ntnyq/utils'
import { browser, defineBackground } from '#imports'
import {
  normalizeBatchRequest,
  normalizeDownloadRequest,
} from '~/utils/download/requests'
import { isAllowedSender } from '~/utils/extension/sender'
import { isRecord } from '~/utils/isRecord'
import { logger } from '~/utils/logger'
import { normalizeBroadcastReplay } from '~/utils/replay/broadcast'
import {
  concurrencySetting,
  getDownloadPreferences,
} from '~/utils/storage/downloadPreferences'
import { downloadRecords } from '~/utils/storage/downloadRecords'
import { isBroadcastId, isPostId, isXUrl } from '~/utils/video/identity'
import { normalizeMediaUrl } from '~/utils/video/variants'
import { createDownloadManager } from './downloadManager'

const log = logger.withTag('background')

export default defineBackground(() => {
  async function resumeDownload(id: number) {
    let onChanged:
      | Parameters<typeof browser.downloads.onChanged.addListener>[0]
      | undefined
    const started = new Promise<void>(resolve => {
      onChanged = delta => {
        if (delta.id === id && delta.state?.current === 'in_progress') {
          resolve()
        }
      }

      browser.downloads.onChanged.addListener(onChanged)
    })

    try {
      // Firefox may keep the resume promise pending until the transfer finishes.
      await Promise.race([started, browser.downloads.resume(id)])
    } finally {
      if (onChanged) {
        browser.downloads.onChanged.removeListener(onChanged)
      }
    }
  }

  const manager = createDownloadManager({
    /**
     * Reads the stored download records through the extension storage adapter.
     *
     * @returns A promise resolving to the persisted records.
     * @throws When reading extension storage fails.
     */
    readRecords: () => downloadRecords.getValue(),
    /**
     * Persists the manager's latest owned-download snapshot.
     *
     * @param records - Complete set of owned records to store.
     * @returns A promise resolving after the storage write.
     * @throws When writing extension storage fails.
     */
    writeRecords: records => downloadRecords.setValue(records),
    readPreferences: getDownloadPreferences,
    /**
     * Forwards validated save options to the native downloads API.
     *
     * @param options - Media URL and filename settings selected by the manager.
     * @returns The browser identifier of the new download.
     * @throws When the native API rejects the request.
     */
    download: options => browser.downloads.download(options),
    /**
     * Looks up a native download for the manager's ownership checks.
     *
     * @param id - Browser download identifier to query.
     * @param url - Original URL of the extension-owned transfer.
     * @returns Matching native download records when ownership still matches.
     * @throws When the native search fails.
     */
    async search(id, url) {
      return (await browser.downloads.search({ id })).filter(
        item =>
          item.byExtensionId === browser.runtime.id
          && normalizeMediaUrl(item.url) === url,
      )
    },
    /**
     * Forwards cancellation of an owned download to the browser.
     *
     * @param id - Browser download identifier already checked by the manager.
     * @returns A promise resolving after cancellation is accepted.
     * @throws When the native cancellation fails.
     */
    cancel: id => browser.downloads.cancel(id),
    pause: id => browser.downloads.pause(id),
    resume: resumeDownload,
  })

  /**
   * Advances persisted tasks even when every extension UI is closed.
   *
   * @param id - Optional changed native ID; omitted for startup or preference changes.
   */
  function refreshQueue(id?: number) {
    manager
      .refresh(id)
      .catch(error => log.warn('Could not refresh download queue', error))
  }

  browser.downloads.onChanged.addListener(delta => refreshQueue(delta.id))
  browser.downloads.onErased.addListener(id => refreshQueue(id))
  concurrencySetting.watch(() => refreshQueue())
  refreshQueue()

  const popupUrl = browser.runtime.getURL('/popup.html')
  const replayPageUrl = browser.runtime.getURL('/replay.html')

  async function getCapturedReplay(tabId: number, broadcastId: string) {
    const response: unknown = await browser.tabs.sendMessage(
      tabId,
      { type: 'get-captured-broadcast-replay', broadcastId },
      { frameId: 0 },
    )
    const replay = normalizeBroadcastReplay(response)

    if (replay?.post.broadcastId === broadcastId) {
      return replay
    }
  }

  browser.runtime.onMessage.addListener(
    (message: unknown, sender, sendResponse) => {
      if (!isRecord(message)) {
        return
      }

      const type = message['type']

      if (
        !isString(type)
        || ![
          'open-broadcast-replay-v1',
          'get-broadcast-replay-v1',
          'download-video',
          'download-videos',
          'get-downloads',
          'download-action',
          'clear-downloads',
          'open-settings',
        ].includes(type)
      ) {
        return
      }

      if (type === 'get-broadcast-replay-v1') {
        const [url, route] = sender.url?.split('#', 2) ?? []
        const [, tabId, broadcastId] =
          route?.match(/^(\d{1,10})\/([\w-]+)$/) ?? []

        if (
          sender.id !== browser.runtime.id
          || url !== replayPageUrl
          || !tabId
          || !isBroadcastId(broadcastId)
        ) {
          sendResponse({ ok: false, error: 'invalidSender' })

          return
        }

        getCapturedReplay(Number(tabId), broadcastId)
          .then(replay =>
            sendResponse(replay ? { ok: true, replay } : { ok: false }),
          )
          .catch(() => sendResponse({ ok: false }))

        return true
      }

      if (!isAllowedSender(sender, browser.runtime.id, popupUrl)) {
        sendResponse({
          ok: false,
          error: 'invalidSender',
        })

        return
      }

      /**
       * Validates a trusted sender's message payload and dispatches the requested operation.
       *
       * @returns The operation response or an invalid-request result.
       * @throws When a manager operation fails; the outer listener converts it to an error response.
       */
      async function handleMessage(message: Record<string, unknown>) {
        const downloadAction = (
          ['cancel', 'pause', 'resume', 'retry'] as const
        ).find(action => action === message['action'])

        if ('force' in message && !isBoolean(message['force'])) {
          return {
            ok: false,
            error: 'invalidRequest',
          }
        }

        if (type === 'open-settings') {
          await browser.runtime.openOptionsPage()

          return {
            ok: true,
          }
        }

        if (
          type === 'open-broadcast-replay-v1'
          && isBroadcastId(message['broadcastId'])
        ) {
          const broadcastId = message['broadcastId']
          const isPopup = sender.url === popupUrl
          const sourceTab = isPopup
            ? (
                await browser.tabs.query({ active: true, currentWindow: true })
              )[0]
            : sender.tab

          if (
            isUndefined(sourceTab?.id)
            || !isXUrl(isPopup ? sourceTab.url : sender.url)
          ) {
            return {
              ok: false,
              error: 'invalidRequest',
            }
          }

          const replay = await getCapturedReplay(
            sourceTab.id,
            broadcastId,
          ).catch(() => undefined)

          if (!replay) {
            return {
              ok: false,
              error: 'invalidRequest',
            }
          }

          await browser.tabs.create({
            url: `${replayPageUrl}#${sourceTab.id}/${broadcastId}`,
          })

          return {
            ok: true,
          }
        }

        if (type === 'download-video') {
          const request = normalizeDownloadRequest(message)

          if (request) {
            return manager.enqueueDownload(request, message['force'] === true)
          }
        } else if (type === 'download-videos') {
          const requests = normalizeBatchRequest(message)

          if (requests) {
            return {
              ok: true,
              results: await manager.batch(requests, message['force'] === true),
            }
          }
        } else if (
          type === 'get-downloads'
          && (isUndefined(message['postId']) || isPostId(message['postId']))
        ) {
          return {
            ok: true,
            downloads: await manager.list(message['postId']),
          }
        } else if (type === 'clear-downloads') {
          const ids = isArray(message['ids'])
            ? Array.from(message['ids'])
            : message['ids']

          if (
            isUndefined(ids)
            || (isArray(ids)
              && ids.every(
                (id): id is number => isNumber(id) && Number.isSafeInteger(id),
              ))
          ) {
            return {
              ok: true,
              removed: await manager.clear(ids),
            }
          }
        } else if (
          type === 'download-action'
          && isNumber(message['downloadId'])
          && Number.isSafeInteger(message['downloadId'])
          && downloadAction
        ) {
          return manager.action(message['downloadId'], downloadAction)
        }

        return {
          ok: false,
          error: 'invalidRequest',
        }
      }

      handleMessage(message)
        .then(sendResponse)
        .catch(error =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : 'actionFailed',
          }),
        )

      return true
    },
  )

  browser.commands.onCommand.addListener(async command => {
    if (command !== 'toggleExtension') {
      return
    }

    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    })

    if (isUndefined(tab?.id) || !isXUrl(tab.url)) {
      return
    }

    try {
      await browser.tabs.sendMessage(tab.id, { type: 'toggle-panel' })
    } catch {
      // An already-open tab needs a refresh after installation.
    }
  })

  browser.runtime.onInstalled.addListener(
    async ({ reason, previousVersion }) => {
      try {
        if (reason === 'install') {
          await browser.tabs.create({
            url: browser.runtime.getURL('/welcome.html'),
          })

          return
        }

        if (
          reason !== 'update'
          || import.meta.env.DEV
          || previousVersion === browser.runtime.getManifest().version
        ) {
          return
        }

        await browser.tabs.create({
          url: browser.runtime.getURL('/changelog.html'),
        })
      } catch (error) {
        log.warn('Could not open the extension introduction page', error)
      }
    },
  )
})
