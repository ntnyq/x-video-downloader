import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root'
import type { ContentScriptContext } from 'wxt/utils/content-script-context'
import type {
  ShadowRootContentScriptUi,
  ShadowRootContentScriptUiOptions,
} from 'wxt/utils/content-script-ui/shadow-root'

/**
 * Creates a shadow UI that releases WXT invalidation callbacks when removed.
 * Callbacks are also released if shadow-UI creation fails.
 *
 * @template TMounted - Value returned by the UI's mount callback.
 * @param ctx - Owning content-script context whose invalidation registrations are tracked.
 * @param options - Shadow-UI mount, removal, positioning, and styling options.
 * @returns The created UI with cleanup integrated into its removal callback.
 * @throws When WXT cannot create the shadow UI; the original error is preserved.
 */
export async function createDisposableShadowRootUi<TMounted>(
  ctx: ContentScriptContext,
  options: ShadowRootContentScriptUiOptions<TMounted>,
): Promise<ShadowRootContentScriptUi<TMounted>> {
  const cleanups = new Set<() => void>()
  const uiContext = new Proxy(ctx, {
    /**
     * Wraps invalidation registration while forwarding all other context property reads.
     *
     * @param target - Original content-script context.
     * @param property - Context property requested through the proxy.
     * @param receiver - Receiver used when forwarding the property read.
     * @returns The tracked registration function or the original property value.
     */
    get(target, property, receiver) {
      if (property === 'onInvalidated') {
        return (callback: () => void) => {
          const stop = target.onInvalidated(callback)
          cleanups.add(stop)
          return () => {
            stop()
            cleanups.delete(stop)
          }
        }
      }
      return Reflect.get(target, property, receiver)
    },
  })

  /**
   * Unregisters every tracked context callback and clears the cleanup set.
   */
  function cleanup() {
    for (const stop of cleanups) {
      stop()
    }
    cleanups.clear()
  }

  try {
    return await createShadowRootUi(uiContext, {
      ...options,
      /**
       * Releases context callbacks before invoking the caller's removal hook.
       *
       * @param mounted - Value produced by the UI mount callback, when available.
       */
      onRemove(mounted) {
        cleanup()
        options.onRemove?.(mounted)
      },
    })
  } catch (error) {
    cleanup()
    throw error
  }
}
