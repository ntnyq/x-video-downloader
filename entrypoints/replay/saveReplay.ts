import { browser } from '#imports'
import { ReplayCancelledError, ReplaySaveError } from './replayErrors'

/**
 * Saves an OPFS file through the browser and holds its Blob URL until the download settles.
 *
 * @param file - Validated replay MP4 to save.
 * @param filename - Suggested filename for the native download.
 * @param saveAs - Whether to ask the user where to save the file.
 * @param signal - Signal used to cancel the native download.
 * @returns A promise that resolves when the browser reports completion.
 * @throws {ReplayCancelledError} When the user cancels via the browser.
 * @throws {ReplaySaveError} When the browser cannot start or complete the download.
 */
export async function saveReplay(
  file: File,
  filename: string,
  saveAs: boolean,
  signal: AbortSignal,
) {
  const url = URL.createObjectURL(file)
  let onChanged:
    | Parameters<typeof browser.downloads.onChanged.addListener>[0]
    | undefined
  let onErased:
    | Parameters<typeof browser.downloads.onErased.addListener>[0]
    | undefined
  let cancel: (() => void) | undefined

  try {
    signal.throwIfAborted()

    let downloadId: number

    try {
      downloadId = await browser.downloads.download({
        url,
        filename,
        saveAs,
        conflictAction: 'uniquify',
      })
    } catch (error) {
      if (
        error instanceof Error
        && /USER_CANCELED|cancel/i.test(error.message)
      ) {
        throw new ReplayCancelledError()
      }

      throw new ReplaySaveError()
    }

    // A small file can finish before the browser returns its native ID.
    await new Promise<void>((resolve, reject) => {
      /**
       * Settles the save when the browser reports a terminal download state.
       *
       * @param state - Download state from an event or a status lookup.
       * @param error - Browser interruption code, if available.
       */
      function check(state?: string, error?: string) {
        if (state === 'complete') {
          resolve()
        } else if (state === 'interrupted') {
          reject(
            error === 'USER_CANCELED'
              ? new ReplayCancelledError()
              : new ReplaySaveError(),
          )
        }
      }

      onChanged = delta => {
        if (delta.id === downloadId) {
          check(delta.state?.current, delta.error?.current)
        }
      }
      onErased = erasedId => {
        if (erasedId === downloadId) {
          reject(new ReplaySaveError())
        }
      }

      const readState = () =>
        browser.downloads
          .search({ id: downloadId })
          .then(([item]) => {
            if (item) {
              check(item.state, item.error)
            } else {
              reject(new ReplaySaveError())
            }
          })
          .catch(() => reject(new ReplaySaveError()))

      cancel = () => {
        browser.downloads
          .cancel(downloadId)
          .then(() => reject(signal.reason))
          .catch(readState)
      }

      browser.downloads.onChanged.addListener(onChanged)
      browser.downloads.onErased.addListener(onErased)
      signal.addEventListener('abort', cancel, { once: true })

      if (signal.aborted) {
        cancel()
      }

      readState()
    })
  } finally {
    if (cancel) {
      signal.removeEventListener('abort', cancel)
    }

    if (onChanged) {
      browser.downloads.onChanged.removeListener(onChanged)
    }

    if (onErased) {
      browser.downloads.onErased.removeListener(onErased)
    }

    URL.revokeObjectURL(url)
  }
}
