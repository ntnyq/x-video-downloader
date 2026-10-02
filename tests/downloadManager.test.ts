import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createDownloadManager } from '../entrypoints/background/downloadManager'
import type { DownloadRecord } from '../types/download'
import type { DownloadRequest } from '../types/video'

const request: DownloadRequest = {
  type: 'download-video',
  postId: '123',
  mediaIndex: 1,
  url: 'https://video.twimg.com/ext_tw_video/1/pu/vid/1280x720/test.mp4',
  author: 'ntnyq',
  createdAt: '2026-10-02T12:00:00.000Z',
}

function setup() {
  let saved: DownloadRecord[] = []
  let nextId = 1
  let failureUrl = ''
  const calls: Array<{ url: string; filename: string; saveAs: boolean }> = []
  const items = new Map<
    number,
    {
      id: number
      state: 'in_progress' | 'complete' | 'interrupted'
      bytesReceived: number
      totalBytes: number
      error?: string
      paused?: boolean
    }
  >()
  const ports = {
    readRecords: async () => structuredClone(saved),
    async writeRecords(records: DownloadRecord[]) {
      saved = structuredClone(records)
    },
    async readPreferences() {
      return {
        saveAs: false,
        quality: 'highest',
        filenameTemplate: '{author}_{date}_{postId}_{index}_{quality}',
      }
    },
    async download(options: {
      url: string
      filename: string
      saveAs: boolean
    }) {
      calls.push(options)
      if (options.url === failureUrl) {
        throw new Error('USER_CANCELED')
      }
      const id = nextId++
      items.set(id, {
        id,
        state: 'in_progress',
        bytesReceived: 25,
        totalBytes: 100,
      })
      return id
    },
    search: async (id: number) => (items.has(id) ? [items.get(id)!] : []),
    async cancel(id: number) {
      const item = items.get(id)
      if (item) {
        item.state = 'interrupted'
        item.error = 'USER_CANCELED'
      }
    },
  }
  return {
    manager: createDownloadManager(ports),
    ports,
    items,
    calls,
    fail(url: string) {
      failureUrl = url
    },
  }
}

test('uses metadata, filename template and saved saveAs preference', async () => {
  const { manager, calls } = setup()
  assert.deepEqual(await manager.start(request), { ok: true, downloadId: 1 })
  assert.equal(calls[0]?.filename, 'ntnyq_2026-10-02_123_1_1280x720.mp4')
  assert.equal(calls[0]?.saveAs, false)
})

test('deduplicates overlapping clicks and already-running transfers', async () => {
  const { manager, calls } = setup()
  const results = await Promise.all([
    manager.start(request),
    manager.start(request),
  ])
  assert.deepEqual(results[0], results[1])
  await manager.start(request)
  assert.equal(calls.length, 1)
})

test('restores progress from owned records after a background restart', async () => {
  const { manager, ports, items } = setup()
  await manager.start(request)
  const reopened = createDownloadManager(ports)
  assert.equal((await reopened.list('123'))[0]?.bytesReceived, 25)
  const item = items.get(1)!
  item.bytesReceived = 100
  item.state = 'complete'
  assert.equal((await reopened.list('123'))[0]?.state, 'complete')
  assert.deepEqual(await reopened.list('999'), [])
})

test('cancels and retries only owned failed downloads', async () => {
  const { manager, calls } = setup()
  await manager.start(request)
  assert.deepEqual(await manager.action(1, 'cancel'), { ok: true })
  assert.equal((await manager.list('123'))[0]?.state, 'cancelled')
  assert.deepEqual(await manager.action(1, 'retry'), {
    ok: true,
    downloadId: 2,
  })
  assert.equal((await manager.action(999, 'cancel')).ok, false)
  assert.equal((await manager.action(2, 'retry')).ok, false)
  assert.equal(calls.length, 2)
})

test('reports native byte totals as unknown and preserves network failures', async () => {
  const { manager, items } = setup()
  await manager.start(request)
  const item = items.get(1)!
  item.totalBytes = -1
  assert.equal((await manager.list('123'))[0]?.totalBytes, -1)
  item.state = 'interrupted'
  item.error = 'NETWORK_FAILED'
  assert.equal((await manager.list('123'))[0]?.error, 'NETWORK_FAILED')
})

test('continues a batch after one failed save and reports per-video results', async () => {
  const { manager, fail, calls } = setup()
  const second = {
    ...request,
    mediaIndex: 2,
    url: request.url.replace('test.mp4', 'second.mp4'),
  }
  const third = {
    ...request,
    mediaIndex: 3,
    url: request.url.replace('test.mp4', 'third.mp4'),
  }
  fail(second.url)
  const results = await manager.batch([request, second, third])
  assert.deepEqual(
    results.map(item => item.result.ok),
    [true, false, true],
  )
  assert.deepEqual(
    calls.map(item => item.url),
    [request.url, second.url, third.url],
  )
  assert.equal((await manager.list('123')).length, 2)
})

test('waits for each save dialog before starting the next batch item', async () => {
  const harness = setup()
  const firstStarted = Promise.withResolvers<void>()
  const releaseFirst = Promise.withResolvers<void>()
  const started: string[] = []
  const manager = createDownloadManager({
    ...harness.ports,
    async download(options) {
      started.push(options.url)
      if (started.length === 1) {
        firstStarted.resolve()
        await releaseFirst.promise
      }
      return harness.ports.download(options)
    },
  })
  const second = {
    ...request,
    mediaIndex: 2,
    url: request.url.replace('test.mp4', 'second.mp4'),
  }
  const batch = manager.batch([request, second])
  await firstStarted.promise
  try {
    assert.deepEqual(started, [request.url])
  } finally {
    releaseFirst.resolve()
  }
  const results = await batch
  assert.deepEqual(started, [request.url, second.url])
  assert.deepEqual(
    results.map(result => result.mediaIndex),
    [1, 2],
  )
})

test('keeps actual downloads manageable when a persistence write fails', async () => {
  const harness = setup()
  const manager = createDownloadManager({
    ...harness.ports,
    async writeRecords() {
      throw new Error('storage full')
    },
  })
  assert.equal((await manager.start(request)).ok, true)
  assert.equal((await manager.list('123'))[0]?.id, 1)
  await manager.start(request)
  assert.equal(harness.calls.length, 1)
})

test('forgets erased browser records without controlling other downloads', async () => {
  const { manager, items } = setup()
  await manager.start(request)
  items.delete(1)
  assert.equal((await manager.list('123'))[0]?.state, 'missing')
  assert.equal((await manager.action(1, 'cancel')).ok, false)
})
