/**
 * @file Context background
 */

import { sendMessage } from 'webext-bridge/background'
import { defineBackground } from '#imports'
import { registerServices } from '~/entrypoints/background/services'
import type { Command } from '~/constants/command'

export default defineBackground(() => {
  console.log('Hello background!', { id: browser.runtime.id })

  registerServices()

  browser.tabs.onUpdated.addListener(async id => {
    const tab = await browser.tabs.get(id)
    const url = tab.url ?? tab.pendingUrl

    console.log({ url })
  })

  // transfer commands to content script
  browser.commands.onCommand.addListener(async command => {
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    })
    if (!activeTab) {
      return
    }
    sendMessage(
      'triggerCommand',
      { command: command as Command },
      `content-script@${activeTab.id}`,
    )
  })

  browser.runtime.onInstalled.addListener(async ({ reason }) => {
    if (reason !== 'install') {
      return
    }

    if (import.meta.env.COMMAND === 'serve') {
      browser.runtime.openOptionsPage()
    } else {
      await browser.tabs.create({
        url: browser.runtime.getURL('/welcome.html'),
        active: true,
      })
    }
  })
})
