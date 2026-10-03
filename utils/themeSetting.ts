import { storage } from '#imports'

/**
 * Shared accent preference for all extension surfaces, independent of download settings.
 */
export const themeSetting = storage.defineItem<string>('local:theme', {
  fallback: 'grok',
})
