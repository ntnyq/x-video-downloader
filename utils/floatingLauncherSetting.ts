import { storage } from '#imports'
import type { FloatingPlacement } from './floatingPosition'

/**
 * Remembers the launcher placement across page reloads and supported site origins.
 */
export const floatingLauncherSetting = storage.defineItem<FloatingPlacement>(
  'local:floatingLauncherPlacement',
)
