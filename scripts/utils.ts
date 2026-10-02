import path from 'node:path'

/**
 * Resolves build-tool paths relative to the repository root.
 *
 * @param args - Path segments to resolve after the repository root.
 * @returns The absolute path resolved using the host platform's path rules.
 */
export const resolve = (...args: string[]): string =>
  path.resolve(import.meta.dirname, '..', ...args)
