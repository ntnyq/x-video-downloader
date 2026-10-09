import assert from 'node:assert/strict'
import { test } from 'node:test'
import { logger } from '../utils/logger'
import type { LogObject } from 'consola/browser'

test('scoped diagnostics retain original errors and suppress production debug output', () => {
  const logs: LogObject[] = []
  const scoped = logger.withTag('downloads')
  scoped.setReporters([{ log: entry => logs.push(entry) }])
  const error = new Error('Storage unavailable')
  scoped.debug('Development detail')
  scoped.info('Routine update')
  scoped.warn('Could not persist download state', error)
  scoped.error('Could not restore download state', error)

  assert.deepEqual(
    logs.map(entry => entry.type),
    ['warn', 'error'],
  )
  assert.ok(logs.every(entry => entry.tag === 'x-video-downloader:downloads'))
  assert.equal(logs[0]?.args[1], error)
  assert.equal(logs[1]?.args[1], error)
})
