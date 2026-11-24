/**
 * Links an operation to a parent signal and aborts it after a period of inactivity.
 *
 * @param parent - Signal whose abort reason is forwarded to the operation.
 * @param delay - Maximum idle time in milliseconds between resets.
 * @param reason - Optional error used when the idle deadline expires.
 * @returns The operation signal, a reset callback, and a disposer for the timer and listener.
 * @throws The parent signal's reason if it is already aborted.
 */
export function startIdleTimeout(
  parent: AbortSignal,
  delay: number,
  reason?: Error,
) {
  parent.throwIfAborted()

  const controller = new AbortController()
  const abort = () => controller.abort(parent.reason)
  let timer: ReturnType<typeof setTimeout>

  function reset() {
    clearTimeout(timer)
    timer = setTimeout(() => controller.abort(reason), delay)
  }

  parent.addEventListener('abort', abort, { once: true })
  reset()

  return {
    signal: controller.signal,
    reset,
    dispose() {
      clearTimeout(timer)
      parent.removeEventListener('abort', abort)
      controller.abort()
    },
  }
}
