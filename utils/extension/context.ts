/**
 * Releases a browser listener when its extension context still allows API calls.
 *
 * @param stop - The browser listener's cleanup callback.
 * @throws When cleanup fails for a reason other than extension invalidation.
 */
export function stopExtensionListener(stop: () => void) {
  try {
    stop()
  } catch (error) {
    if (
      !(error instanceof Error)
      || error.message !== 'Extension context invalidated.'
    ) {
      throw error
    }
  }
}
