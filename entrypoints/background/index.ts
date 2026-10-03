import { browser, defineBackground } from '#imports'
import {
  isAllowedSender,
  normalizeBatchRequest,
  normalizeDownloadRequest,
} from '~/utils/download'
import { downloadRecords, getDownloadPreferences } from '~/utils/settings'
import { isPostId, isRecord, isXUrl } from '~/utils/video'
import { createDownloadManager } from './downloadManager'

export default defineBackground(() => {
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
     * @returns Matching native download records.
     * @throws When the native search fails.
     */
    search: id => browser.downloads.search({ id }),
    /**
     * Forwards cancellation of an owned download to the browser.
     *
     * @param id - Browser download identifier already checked by the manager.
     * @returns A promise resolving after cancellation is accepted.
     * @throws When the native cancellation fails.
     */
    cancel: id => browser.downloads.cancel(id),
  })

  browser.runtime.onMessage.addListener(
    (message: unknown, sender, sendResponse) => {
      if (
        !isRecord(message)
        || ![
          'download-video',
          'download-videos',
          'get-downloads',
          'download-action',
          'open-settings',
        ].includes(String(message['type']))
      ) {
        return
      }
      if (
        !isAllowedSender(
          sender,
          browser.runtime.id,
          browser.runtime.getURL('/popup.html'),
        )
      ) {
        sendResponse({
          ok: false,
          error: 'invalidSender',
        })
        return
      }
      /**
       * Validates a trusted sender's message payload and dispatches the requested operation.
       *
       * @returns The operation response, an invalid-request result, or undefined for a non-object payload.
       * @throws When a manager operation fails; the outer listener converts it to an error response.
       */
      async function handleMessage() {
        if (!isRecord(message)) {
          return
        }
        if (message['type'] === 'open-settings') {
          await browser.runtime.openOptionsPage()
          return { ok: true }
        }
        if (message['type'] === 'download-video') {
          const request = normalizeDownloadRequest(message)
          if (request) {
            return manager.start(request)
          }
        } else if (message['type'] === 'download-videos') {
          const requests = normalizeBatchRequest(message)
          if (requests) {
            return { ok: true, results: await manager.batch(requests) }
          }
        } else if (
          message['type'] === 'get-downloads'
          && isPostId(message['postId'])
        ) {
          return { ok: true, downloads: await manager.list(message['postId']) }
        } else if (
          message['type'] === 'download-action'
          && typeof message['downloadId'] === 'number'
          && Number.isInteger(message['downloadId'])
          && (message['action'] === 'cancel' || message['action'] === 'retry')
        ) {
          return manager.action(message['downloadId'], message['action'])
        }
        return { ok: false, error: 'invalidRequest' }
      }
      handleMessage()
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
    if (tab?.id === undefined || !isXUrl(tab.url)) {
      return
    }
    try {
      await browser.tabs.sendMessage(tab.id, { type: 'toggle-panel' })
    } catch {
      // An already-open tab needs a refresh after installation.
    }
  })

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') {
      browser.tabs.create({ url: browser.runtime.getURL('/welcome.html') })
    }
  })
})
