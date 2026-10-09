import { inject, provide } from 'vue'
import type { InjectionKey, Ref } from 'vue'

const overlayTargetKey: InjectionKey<Readonly<Ref<HTMLElement | null>>> =
  Symbol('overlayTarget')

/**
 * Keeps portalled controls inside the extension's theme and Shadow DOM,
 * outside scrolling or transformed panel content.
 */
export function provideOverlayTarget(
  target: Readonly<Ref<HTMLElement | null>>,
) {
  provide(overlayTargetKey, target)
}

/**
 * Resolves the owning surface's portal container, when one is provided.
 */
export function useOverlayTarget() {
  return inject(overlayTargetKey, undefined)
}
