import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root'
import type { ContentScriptContext } from 'wxt/utils/content-script-context'
import type {
  ShadowRootContentScriptUi,
  ShadowRootContentScriptUiOptions,
} from 'wxt/utils/content-script-ui/shadow-root'

/**
 * Release WXT's context callbacks when a timeline control is removed.
 */
export async function createDisposableShadowRootUi<TMounted>(
  ctx: ContentScriptContext,
  options: ShadowRootContentScriptUiOptions<TMounted>,
): Promise<ShadowRootContentScriptUi<TMounted>> {
  const cleanups = new Set<() => void>()
  const uiContext = new Proxy(ctx, {
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

  function cleanup() {
    for (const stop of cleanups) {
      stop()
    }
    cleanups.clear()
  }

  try {
    return await createShadowRootUi(uiContext, {
      ...options,
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
