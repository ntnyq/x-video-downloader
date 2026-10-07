import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MAX_DOWNLOAD_BATCH_SIZE,
  normalizeBatchRequest,
} from '../utils/download'
import { normalizeVariants } from '../utils/video'
import {
  createSelectedVideoRequests,
  createVideoSelectionRows,
  setVideoSelectionChecked,
} from '../utils/videoSelection'
import type { VideoPost } from '../types/video'
import type { VideoSelectionState } from '../utils/videoSelection'

/**
 * Creates a captured post with shared media IDs to expose cross-post collisions.
 *
 * @param id - Post identifier used in expected download requests.
 * @param count - Number of downloadable videos to include.
 * @returns A post with two qualities and complete filename metadata.
 */
function createPost(id: string, count = 1): VideoPost {
  return {
    id,
    author: `author${id}`,
    createdAt: '2026-10-05T00:00:00.000Z',
    text: '',
    media: Array.from({ length: count }, (_, index) => ({
      id: `shared-media-${index}`,
      hasHls: false,
      variants: normalizeVariants([
        {
          url: `https://video.twimg.com/${id}/${index}/1920x1080/video.mp4`,
          bitrate: 4000000,
        },
        {
          url: `https://video.twimg.com/${id}/${index}/640x360/video.mp4`,
          bitrate: 300000,
        },
      ]),
    })),
  }
}

/**
 * Creates independent selection state for each behavior test.
 *
 * @returns Selection state with every downloadable video initially included.
 */
function createSelection(): VideoSelectionState {
  return { selectedUrls: {}, excludedKeys: [] }
}

test('page batches include multiple posts while preserving media positions and metadata', () => {
  const rows = createVideoSelectionRows(
    [createPost('123', 2), createPost('456')],
    'highest',
    createSelection(),
  )
  const requests = createSelectedVideoRequests(rows)
  assert.deepEqual(
    requests.map(request => [request.postId, request.mediaIndex]),
    [
      ['123', 1],
      ['123', 2],
      ['456', 1],
    ],
  )
  assert.equal(requests[2]?.author, 'author456')
  assert.equal(requests[2]?.createdAt, '2026-10-05T00:00:00.000Z')
  assert.equal(
    normalizeBatchRequest({ type: 'download-videos', requests })?.length,
    3,
  )
})

test('post and media selection changes affect one shared page selection without ID collisions', () => {
  const posts = [createPost('123', 2), createPost('456', 2)]
  const original = createSelection()
  const excludedPost = setVideoSelectionChecked(
    original,
    ['123:1', '123:2'],
    false,
  )
  const restoredMedia = setVideoSelectionChecked(excludedPost, ['123:2'], true)
  const rows = createVideoSelectionRows(posts, 'highest', restoredMedia)
  assert.deepEqual(
    rows.filter(row => row.checked).map(row => row.key),
    ['123:2', '456:1', '456:2'],
  )
  assert.deepEqual(original.excludedKeys, [])
  assert.deepEqual(excludedPost.excludedKeys, ['123:1', '123:2'])
})

test('clear and select all use visible row keys without losing hidden post selections', () => {
  const posts = [createPost('123'), createPost('456')]
  const state = setVideoSelectionChecked(createSelection(), ['123:1'], false)
  const visibleRows = createVideoSelectionRows([posts[1]!], 'highest', state)
  const cleared = setVideoSelectionChecked(
    state,
    visibleRows.map(row => row.key),
    false,
  )
  assert.equal(
    createSelectedVideoRequests(
      createVideoSelectionRows(posts, 'highest', cleared),
    ).length,
    0,
  )
  const selected = setVideoSelectionChecked(
    cleared,
    visibleRows.map(row => row.key),
    true,
  )
  assert.deepEqual(
    createSelectedVideoRequests(
      createVideoSelectionRows(posts, 'highest', selected),
    ).map(request => request.postId),
    ['456'],
  )
})

test('manual quality is shared by page and single-media requests and is scoped to its post', () => {
  const posts = [createPost('123'), createPost('456')]
  const manualUrl = posts[0]!.media[0]!.variants[1]!.url
  const selection = {
    ...createSelection(),
    selectedUrls: { '123:1': manualUrl },
  }
  const rows = createVideoSelectionRows(posts, 'highest', selection)
  const pageRequests = createSelectedVideoRequests(rows)
  const singleRequest = createSelectedVideoRequests(rows, {
    postId: '123',
    mediaIndex: 1,
  })
  assert.equal(pageRequests[0]?.url, manualUrl)
  assert.equal(singleRequest[0]?.url, manualUrl)
  assert.equal(rows[1]?.variant?.height, 1080)
  assert.equal(
    createSelectedVideoRequests(rows, { postId: '123', highest: true })[0]?.url,
    posts[0]?.media[0]?.variants[0]?.url,
  )
  assert.equal(selection.selectedUrls['123:1'], manualUrl)
})

test('single-media actions still download an unchecked video without selecting it', () => {
  const selection = setVideoSelectionChecked(
    createSelection(),
    ['123:1'],
    false,
  )
  const rows = createVideoSelectionRows(
    [createPost('123'), createPost('456')],
    'highest',
    selection,
  )
  assert.deepEqual(
    createSelectedVideoRequests(rows).map(request => request.postId),
    ['456'],
  )
  assert.deepEqual(
    createSelectedVideoRequests(rows, { postId: '123', mediaIndex: 1 }).map(
      request => request.postId,
    ),
    ['123'],
  )
  assert.equal(rows[0]?.checked, false)
})

test('HLS-only media stays visible but never joins page or single-media requests', () => {
  const post = createPost('123')
  post.media.push({ id: 'hls-only', hasHls: true, variants: [] })
  const rows = createVideoSelectionRows([post], 'highest', createSelection())
  assert.equal(rows.length, 2)
  assert.equal(rows[1]?.checked, false)
  assert.equal(createSelectedVideoRequests(rows).length, 1)
  assert.deepEqual(
    createSelectedVideoRequests(rows, { postId: '123', mediaIndex: 2 }),
    [],
  )
})

test('changed or removed quality URLs fall back to the current saved preference', () => {
  const selection = {
    ...createSelection(),
    selectedUrls: { '123:1': 'https://video.twimg.com/old.mp4' },
  }
  const rows = createVideoSelectionRows(
    [createPost('123')],
    'smallest',
    selection,
  )
  assert.equal(rows[0]?.variant?.height, 360)
})

test('page filtering never submits hidden posts even when their selection is remembered', () => {
  const rows = createVideoSelectionRows([createPost('456')], 'highest', {
    ...createSelection(),
    selectedUrls: { '123:1': 'https://video.twimg.com/hidden.mp4' },
  })
  assert.deepEqual(
    createSelectedVideoRequests(rows).map(request => request.postId),
    ['456'],
  )
  assert.deepEqual(createSelectedVideoRequests(rows, { postId: '123' }), [])
})

test('over-limit selections remain intact and fail validation instead of silently dropping videos', () => {
  const posts = Array.from(
    { length: MAX_DOWNLOAD_BATCH_SIZE + 1 },
    (_, index) => createPost(String(index + 1)),
  )
  const rows = createVideoSelectionRows(posts, 'highest', createSelection())
  const requests = createSelectedVideoRequests(rows)
  assert.equal(requests.length, MAX_DOWNLOAD_BATCH_SIZE + 1)
  assert.equal(
    rows.filter(row => row.checked).length,
    MAX_DOWNLOAD_BATCH_SIZE + 1,
  )
  assert.equal(
    normalizeBatchRequest({ type: 'download-videos', requests }),
    undefined,
  )
  const withinLimit = setVideoSelectionChecked(
    createSelection(),
    [rows[0]!.key],
    false,
  )
  const accepted = createSelectedVideoRequests(
    createVideoSelectionRows(posts, 'highest', withinLimit),
  )
  assert.equal(accepted.length, MAX_DOWNLOAD_BATCH_SIZE)
  assert.equal(
    normalizeBatchRequest({ type: 'download-videos', requests: accepted })
      ?.length,
    MAX_DOWNLOAD_BATCH_SIZE,
  )
})
