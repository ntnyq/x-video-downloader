import { isXUrl } from '../video/identity'

/**
 * Accepts messages only from this extension's popup or an X/Twitter content script.
 *
 * @param sender - Browser-supplied identity and page information for the message sender.
 * @param sender.id - Extension identifier supplied by the browser.
 * @param sender.url - URL of the sending popup or content-script page.
 * @param sender.tab - Optional metadata for the tab associated with the sender.
 * @param extensionId - Identifier of the running extension.
 * @param popupUrl - Exact extension popup URL allowed to send requests.
 * @returns Whether the sender matches both the extension and an allowed surface.
 */
export function isAllowedSender(
  sender: {
    /**
     * Extension identifier reported by the browser for the message sender.
     */
    id?: string
    /**
     * URL of the sending popup or content-script page.
     */
    url?: string
    /**
     * Browser tab metadata supplied for the sender.
     */
    tab?: unknown
  },
  extensionId: string,
  popupUrl: string,
): boolean {
  return (
    sender.id === extensionId
    && (sender.url === popupUrl || (Boolean(sender.tab) && isXUrl(sender.url)))
  )
}
