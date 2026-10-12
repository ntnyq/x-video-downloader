import { storage } from '#imports'
import { DEFAULT_THEME } from '../constants/theme'

/**
 * Shared accent preference for all extension surfaces, independent of download settings.
 */
export const themeSetting = storage.defineItem<string>('local:theme', {
  fallback: DEFAULT_THEME,
})
