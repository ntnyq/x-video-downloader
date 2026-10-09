import { createConsola } from 'consola/browser'

/**
 * Shared browser-safe logger. Development builds also include debug messages.
 * Keep captured responses, authentication data, and download URLs out of logs.
 */
export const logger = createConsola({
  level: import.meta.env?.DEV ? 4 : 1,
  defaults: { tag: 'x-video-downloader' },
})
