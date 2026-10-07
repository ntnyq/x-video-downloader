import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  filterDownloadHistory,
  isDownloadStatus,
  isTerminalDownload,
} from '../utils/downloadHistory'
import type { DownloadStatus } from '../types/download'

const download: DownloadStatus = {
  id: 42,
  postId: '123',
  mediaIndex: 1,
  filename: 'Launch_Demo.mp4',
  author: 'Alice',
  startedAt: 1000,
  bytesReceived: 25,
  totalBytes: 100,
  state: 'in_progress',
}

test('accepts queued identities, unknown sizes, legacy dates and all supported states', () => {
  for (const state of [
    'queued',
    'in_progress',
    'paused',
    'complete',
    'interrupted',
    'cancelled',
    'missing',
  ]) {
    assert.equal(isDownloadStatus({ ...download, state }), true, state)
  }
  assert.equal(
    isDownloadStatus({
      ...download,
      id: -1,
      state: 'queued',
      startedAt: 0,
      totalBytes: -1,
      author: undefined,
    }),
    true,
  )
})

test('rejects malformed history data before it reaches rendering or filtering', () => {
  for (const invalid of [
    undefined,
    null,
    [],
    {},
    { ...download, id: 1.5 },
    { ...download, id: Number.MAX_SAFE_INTEGER + 1 },
    { ...download, postId: 'not-a-post' },
    { ...download, filename: null },
    { ...download, mediaIndex: 0 },
    { ...download, mediaIndex: 17 },
    { ...download, mediaIndex: 1.5 },
    { ...download, bytesReceived: Number.NaN },
    { ...download, totalBytes: Infinity },
    { ...download, startedAt: undefined },
    { ...download, startedAt: Number.NaN },
    { ...download, startedAt: Infinity },
    { ...download, author: 3 },
    { ...download, error: {} },
    { ...download, state: 'unknown' },
    { ...download, state: ['complete'] },
  ]) {
    assert.equal(isDownloadStatus(invalid), false, JSON.stringify(invalid))
  }
})

test('history clearing keeps queued, transferring and paused tasks', () => {
  for (const state of ['queued', 'in_progress', 'paused'] as const) {
    assert.equal(isTerminalDownload({ ...download, state }), false, state)
  }
  for (const state of [
    'complete',
    'interrupted',
    'cancelled',
    'missing',
  ] as const) {
    assert.equal(isTerminalDownload({ ...download, state }), true, state)
  }
})

test('searches filenames, authors and post IDs without mutating or reordering history', () => {
  const history: DownloadStatus[] = [
    download,
    {
      ...download,
      id: 43,
      postId: '456',
      author: 'Bob',
      filename: 'Other.mp4',
    },
    {
      ...download,
      id: 44,
      postId: '789',
      author: undefined,
      filename: 'Demo.mp4',
    },
  ]
  const original = structuredClone(history)
  assert.deepEqual(
    filterDownloadHistory(history, '  DEMO  ').map(item => item.id),
    [42, 44],
  )
  assert.deepEqual(
    filterDownloadHistory(history, 'alice').map(item => item.id),
    [42],
  )
  assert.deepEqual(
    filterDownloadHistory(history, '456').map(item => item.id),
    [43],
  )
  assert.deepEqual(filterDownloadHistory(history, '  '), history)
  assert.deepEqual(filterDownloadHistory(history, 'absent'), [])
  assert.deepEqual(history, original)
})

test('combines text search with an exact case-insensitive author filter', () => {
  const history: DownloadStatus[] = [
    download,
    { ...download, id: 43, author: 'AliceOther' },
    { ...download, id: 44, author: undefined },
  ]
  assert.deepEqual(filterDownloadHistory(history, 'demo', '@aLiCe'), [download])
  assert.deepEqual(filterDownloadHistory(history, 'absent', 'Alice'), [])
  assert.deepEqual(filterDownloadHistory(history, '', 'Ali'), [])
})
