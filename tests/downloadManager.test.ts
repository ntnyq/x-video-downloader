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

/**
 * Creates an in-memory download manager with controllable native state and storage.
 *
 * @returns The manager, adapters, recorded calls, native records, and a failure selector.
 */
function setup() {
  let saved: DownloadRecord[] = []
  let nextId = 1
  let failureUrl = ''
  const calls: Array<{
    /**
     * MP4 URL passed to the mocked native download operation.
     */
    url: string
    /**
     * Requested or simulated native filename used in filename assertions.
     */
    filename: string
    /**
     * Whether the mocked browser should be asked to open a save dialog.
     */
    saveAs: boolean
  }> = []
  const items = new Map<
    number,
    {
      /**
       * Synthetic browser download identifier assigned by the fixture.
       */
      id: number
      /**
       * Mutable native transfer state used to exercise manager state normalization.
       */
      state: 'in_progress' | 'complete' | 'interrupted'
      /**
       * Simulated number of bytes received by the download.
       */
      bytesReceived: number
      /**
       * Simulated expected byte count, with negative values representing unknown size.
       */
      totalBytes: number
      /**
       * Requested or simulated native filename used in filename assertions.
       */
      filename?: string
      /**
       * Optional native error code used to simulate interruption or cancellation.
       */
      error?: string
      /**
       * Whether the simulated native download is paused.
       */
      paused?: boolean
    }
  >()
  const ports = {
    /**
     * Reads an isolated copy of the fixture's persisted download records.
     *
     * @returns The cloned persisted records.
     */
    readRecords: async () => structuredClone(saved),
    /**
     * Persists an isolated snapshot in the fixture's in-memory storage.
     *
     * @param records - Owned records written by the manager.
     * @returns A promise resolving after the fixture snapshot is replaced.
     */
    async writeRecords(records: DownloadRecord[]) {
      saved = structuredClone(records)
    },
    /**
     * Provides deterministic download preferences for manager assertions.
     *
     * @returns Preferences using metadata tokens, highest quality, and no save dialog.
     */
    async readPreferences() {
      return {
        saveAs: false,
        quality: 'highest',
        filenameTemplate: '{author}_{date}_{postId}_{index}_{quality}',
      }
    },
    /**
     * Records a native download attempt and creates an active fixture record.
     *
     * @param options - Requested media URL, filename, and save-dialog setting.
     * @param options.url - MP4 URL used to match the configured failure case.
     * @param options.filename - Requested basename recorded for filename assertions.
     * @param options.saveAs - Save-dialog preference recorded for assertions.
     * @returns The newly assigned synthetic download identifier.
     * @throws With USER_CANCELED when the URL matches the fixture's failure selector.
     */
    async download(options: {
      /**
       * MP4 URL passed to the mocked native download operation.
       */
      url: string
      /**
       * Requested or simulated native filename used in filename assertions.
       */
      filename: string
      /**
       * Whether the mocked browser should be asked to open a save dialog.
       */
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
    /**
     * Looks up a synthetic native download by ID.
     *
     * @param id - Browser identifier requested by the manager.
     * @returns The matching fixture record, or an empty array after it has been erased.
     */
    search: async (id: number) => (items.has(id) ? [items.get(id)!] : []),
    /**
     * Marks an existing native fixture record as interrupted by user cancellation.
     *
     * @param id - Identifier of the fixture download to cancel.
     * @returns A promise resolving after the simulated state update.
     */
    async pause(id: number) {
      const item = items.get(id)
      if (item) {
        item.paused = true
      }
    },
    async resume(id: number) {
      const item = items.get(id)
      if (item) {
        item.paused = false
      }
    },
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
    /**
     * Selects a media URL whose subsequent download attempts should be rejected.
     *
     * @param url - MP4 URL to simulate user cancellation for.
     */
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

test('uses direct downloads by default and honors save-location choices for singles and batches', async () => {
  for (const saveAs of [undefined, false, true]) {
    const { ports, calls } = setup()
    const manager = createDownloadManager({
      ...ports,
      readPreferences: async () => ({ saveAs }),
    })
    assert.equal((await manager.start(request)).ok, true)
    const results = await manager.batch(
      [2, 3].map(mediaIndex => ({
        ...request,
        mediaIndex,
        url: request.url.replace('test.mp4', () => `${mediaIndex}.mp4`),
      })),
    )
    assert.deepEqual(
      results.map(item => item.result.ok),
      [true, true],
    )
    assert.equal(calls.length, 3)
    for (const call of calls) {
      assert.equal(call.saveAs, saveAs === true)
    }
  }
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

test('reports renamed and uniquified native filenames without directory paths', async () => {
  const { manager, ports, items } = setup()
  await manager.start(request)
  const item = items.get(1)!
  item.filename = '/Users/review/Downloads/renamed-by-user.mp4'
  assert.equal((await manager.list('123'))[0]?.filename, 'renamed-by-user.mp4')

  const reopened = createDownloadManager(ports)
  item.filename = String.raw`C:\Users\review\Downloads\video (1).mp4`
  assert.equal((await reopened.list('123'))[0]?.filename, 'video (1).mp4')

  item.filename = ''
  assert.equal(
    (await reopened.list('123'))[0]?.filename,
    'ntnyq_2026-10-02_123_1_1280x720.mp4',
  )
  items.delete(1)
  assert.equal(
    (await reopened.list('123'))[0]?.filename,
    'ntnyq_2026-10-02_123_1_1280x720.mp4',
  )
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
  assert.equal((await manager.list('123')).length, 3)
})

test('waits for each save dialog before starting the next batch item', async () => {
  const harness = setup()
  const firstStarted = Promise.withResolvers<void>()
  const releaseFirst = Promise.withResolvers<void>()
  const started: string[] = []
  const manager = createDownloadManager({
    ...harness.ports,
    /**
     * Holds the first save operation until released to verify sequential batch starts.
     *
     * @param options - Download options forwarded to the underlying fixture adapter.
     * @returns The identifier produced by the underlying download adapter.
     * @throws When the underlying fixture download fails.
     */
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

test('keeps actual downloads manageable when a persistence write fails', async t => {
  const warning = t.mock.method(console, 'warn', () => {})
  const harness = setup()
  let writes = 0
  const manager = createDownloadManager({
    ...harness.ports,
    /**
     * Simulates a storage failure after a native download has already started.
     *
     * @returns A rejected storage-write promise.
     * @throws Always, with the storage-full fixture error.
     */
    async writeRecords(records) {
      if (++writes === 3) {
        throw new Error('storage full')
      }
      await harness.ports.writeRecords(records)
    },
  })
  assert.equal((await manager.start(request)).ok, true)
  assert.equal(warning.mock.callCount(), 1)
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

test('persists cross-post queue admission before starting and respects concurrency', async () => {
  const { ports, calls } = setup()
  const manager = createDownloadManager({
    ...ports,
    readPreferences: async () => ({ concurrency: 2 }),
    async download(options) {
      const saved = await ports.readRecords()
      assert.equal(saved.length, 5)
      assert.ok(saved.some(record => record.id < 0 && record.starting))
      return ports.download(options)
    },
  })
  const results = await manager.batch(
    Array.from({ length: 5 }, (_, index) => ({
      ...request,
      postId: String(index + 1),
    })),
  )
  assert.equal(calls.length, 2)
  assert.ok(results.every(result => result.result.ok))
  assert.deepEqual(
    results.map(result => result.postId),
    ['1', '2', '3', '4', '5'],
  )
  const statuses = await manager.list()
  assert.equal(statuses.filter(status => status.state === 'queued').length, 3)
  assert.equal(
    statuses.filter(status => status.state === 'in_progress').length,
    2,
  )
  assert.ok(
    statuses.every(status => status.author === 'ntnyq' && status.startedAt > 0),
  )
})

test('advances a durable queue after completion and worker restart without UI polling', async () => {
  const { ports, items, calls } = setup()
  const configured = {
    ...ports,
    readPreferences: async () => ({ concurrency: 1 }),
  }
  const manager = createDownloadManager(configured)
  await manager.batch([
    request,
    { ...request, postId: '456' },
    { ...request, postId: '789' },
  ])
  assert.equal(calls.length, 1)
  items.get(1)!.state = 'complete'
  const reopened = createDownloadManager(configured)
  await reopened.refresh()
  assert.equal(calls.length, 2)
  assert.equal(
    (await reopened.list()).filter(status => status.state === 'queued').length,
    1,
  )
  items.get(2)!.state = 'interrupted'
  await reopened.refresh(2)
  assert.equal(calls.length, 3)
  await reopened.refresh(900)
  assert.equal(calls.length, 3)
})

test('serializes simultaneous admission so distinct requests cannot exceed the transfer limit', async () => {
  const { ports, calls } = setup()
  const manager = createDownloadManager({
    ...ports,
    readPreferences: async () => ({ concurrency: 1 }),
  })
  const results = await Promise.all(
    Array.from({ length: 6 }, (_, index) =>
      manager.start({ ...request, postId: String(index + 1) }),
    ),
  )
  assert.ok(results.every(result => result.ok))
  assert.equal(calls.length, 1)
  assert.equal(
    (await manager.list()).filter(status => status.state === 'queued').length,
    5,
  )
})

test('pauses queued and native tasks and queues native resumes behind the concurrency limit', async () => {
  const { ports, items, calls } = setup()
  const manager = createDownloadManager({
    ...ports,
    readPreferences: async () => ({ concurrency: 1 }),
  })
  await manager.batch([request, { ...request, postId: '456' }])
  const queued = (await manager.list()).find(
    status => status.state === 'queued',
  )!
  await manager.action(queued.id, 'pause')
  assert.equal((await manager.list())[0]?.state, 'paused')
  await manager.action(1, 'pause')
  assert.equal(calls.length, 1)
  assert.equal(items.get(1)?.paused, true)
  await manager.action(queued.id, 'resume')
  assert.equal(calls.length, 2)
  await manager.action(1, 'resume')
  assert.equal(
    (await manager.list()).find(status => status.id === 1)?.state,
    'queued',
  )
  assert.equal(items.get(1)?.paused, true)
  await manager.action(2, 'cancel')
  assert.equal(items.get(1)?.paused, false)
  assert.equal(
    (await manager.list()).find(status => status.id === 1)?.state,
    'in_progress',
  )
})

test('cancels queued work without native calls and preserves active tasks when clearing history', async () => {
  const { ports, calls } = setup()
  const manager = createDownloadManager({
    ...ports,
    readPreferences: async () => ({ concurrency: 1 }),
  })
  await manager.batch([
    request,
    { ...request, postId: '456' },
    { ...request, postId: '789' },
  ])
  const queued = (await manager.list()).filter(
    status => status.state === 'queued',
  )
  await manager.action(queued[0]!.id, 'cancel')
  await manager.action(queued[1]!.id, 'pause')
  assert.equal(await manager.clear([1, queued[1]!.id, 999]), 0)
  assert.equal(await manager.clear(), 1)
  assert.equal((await manager.list()).length, 2)
  assert.equal(calls.length, 1)
  for (const action of ['pause', 'resume', 'cancel', 'retry'] as const) {
    assert.deepEqual(await manager.action(999, action), {
      ok: false,
      error: 'foreignDownload',
    })
  }
})

test('warns about completed media across quality URLs and requires explicit repeat confirmation', async () => {
  const { manager, items, calls } = setup()
  await manager.start(request)
  items.get(1)!.state = 'complete'
  assert.deepEqual(
    await manager.start({
      ...request,
      url: request.url.replace('1280x720', '1920x1080'),
    }),
    { ok: false, error: 'duplicateDownload' },
  )
  items.delete(1)
  assert.deepEqual(await manager.start(request), {
    ok: false,
    error: 'duplicateDownload',
  })
  assert.deepEqual(await manager.start(request, true), {
    ok: true,
    downloadId: 2,
  })
  assert.equal(calls.length, 2)
})

test('recovers an ambiguous native-start handoff as an explicit retry instead of duplicating it', async () => {
  const { ports, calls } = setup()
  await ports.writeRecords([
    {
      id: -1,
      filename: 'queued.mp4',
      request,
      state: 'queued',
      starting: true,
    },
  ])
  const manager = createDownloadManager(ports)
  await manager.refresh()
  assert.equal(calls.length, 0)
  const [status] = await manager.list()
  assert.equal(status?.state, 'interrupted')
  assert.equal(status?.error, 'START_INTERRUPTED')
  assert.equal((await manager.action(-1, 'retry')).ok, true)
  assert.equal(calls.length, 1)
})

test('rejects queue admission before native effects when the initial storage write fails', async () => {
  const { ports, calls } = setup()
  const manager = createDownloadManager({
    ...ports,
    async writeRecords() {
      throw new Error('storage full')
    },
  })
  assert.deepEqual(await manager.start(request), {
    ok: false,
    error: 'storage full',
  })
  assert.equal(calls.length, 0)
})

test('bounds terminal history without pruning active tasks or scanning completed native records', async () => {
  const { ports } = setup()
  await ports.writeRecords([
    ...Array.from({ length: 220 }, (_, index) => ({
      id: index + 1001,
      filename: 'complete.mp4',
      request: { ...request, postId: String(index + 1) },
      state: 'complete' as const,
    })),
    { id: -1, filename: 'paused.mp4', request, state: 'paused' },
  ])
  const manager = createDownloadManager({
    ...ports,
    async search() {
      throw new Error('completed history must use its persisted snapshot')
    },
  })
  const statuses = await manager.list()
  assert.equal(statuses.length, 201)
  assert.equal(statuses.filter(status => status.state === 'paused').length, 1)
  assert.equal(
    statuses.some(status => status.id === 1001),
    false,
  )
  assert.equal(
    statuses.some(status => status.id === 1021),
    true,
  )
  assert.equal((await ports.readRecords()).length, 201)
})

test('limits outstanding work to one thousand while allowing existing task reuse', async () => {
  const { ports, calls } = setup()
  await ports.writeRecords(
    Array.from({ length: 1000 }, (_, index) => ({
      id: -(index + 1),
      filename: 'paused.mp4',
      request: { ...request, postId: String(index + 1) },
      state: 'paused',
    })),
  )
  const manager = createDownloadManager(ports)
  assert.deepEqual(await manager.start({ ...request, postId: '1001' }), {
    ok: false,
    error: 'queueFull',
  })
  assert.equal((await manager.start({ ...request, postId: '1' })).ok, true)
  assert.equal(calls.length, 0)
  await manager.action(-1, 'cancel')
  assert.equal((await manager.start({ ...request, postId: '1001' })).ok, true)
  assert.equal(calls.length, 1)
})

test('recovers a failed handoff write on listing and retains queued action aliases after restart', async t => {
  t.mock.method(console, 'warn', () => {})
  const { ports, calls, items } = setup()
  let writes = 0
  const manager = createDownloadManager({
    ...ports,
    async writeRecords(records) {
      if (++writes === 2) {
        throw new Error('temporary storage failure')
      }
      await ports.writeRecords(records)
    },
  })
  const result = await manager.start(request)
  assert.ok(result.ok)
  assert.ok(result.downloadId < 0)
  assert.equal(calls.length, 0)
  assert.equal((await manager.list())[0]?.state, 'in_progress')
  assert.equal(calls.length, 1)
  assert.deepEqual(await manager.action(result.downloadId, 'pause'), {
    ok: true,
  })
  assert.equal(items.get(1)?.paused, true)
  const reopened = createDownloadManager(ports)
  assert.deepEqual(await reopened.action(result.downloadId, 'resume'), {
    ok: true,
  })
  assert.equal(items.get(1)?.paused, false)
})

test('keeps a native transfer manageable when the browser refuses to resume it', async () => {
  const { ports, items } = setup()
  const manager = createDownloadManager({
    ...ports,
    async resume() {
      throw new Error('NETWORK_FAILED')
    },
  })
  await manager.start(request)
  await manager.action(1, 'pause')
  assert.deepEqual(await manager.action(1, 'resume'), {
    ok: false,
    error: 'NETWORK_FAILED',
  })
  assert.equal(items.get(1)?.paused, true)
  assert.equal(await manager.clear(), 0)
  assert.equal((await manager.list())[0]?.state, 'paused')
})
