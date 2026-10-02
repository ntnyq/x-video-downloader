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
    readRecords: () => downloadRecords.getValue(),
    writeRecords: records => downloadRecords.setValue(records),
    readPreferences: getDownloadPreferences,
    download: options => browser.downloads.download(options),
    search: id => browser.downloads.search({ id }),
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
      async function handleMessage() {
        if (!isRecord(message)) {
          return
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
