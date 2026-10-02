import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeBatchRequest } from '../utils/download'
import {
  buildFilename,
  DEFAULT_FILENAME_TEMPLATE,
  formatBytes,
  normalizePreferences,
  selectPreferredVariant,
  validateFilenameTemplate,
} from '../utils/preferences'
import { extractVideoPosts, normalizeVariants } from '../utils/video'

function variant(size: string, bitrate = 0) {
  return {
    url: `https://video.twimg.com/ext_tw_video/1/pu/vid/${size}/video.mp4`,
    bitrate,
  }
}
const variants = normalizeVariants([
  variant('3840x2160', 8000000),
  variant('1920x1080', 4000000),
  variant('1280x720', 2000000),
  variant('640x360', 300000),
])

test('selects highest, capped and smallest versions deterministically', () => {
  assert.equal(selectPreferredVariant(variants, 'highest')?.height, 2160)
  assert.equal(selectPreferredVariant(variants, '1080p')?.height, 1080)
  assert.equal(selectPreferredVariant(variants, '720p')?.height, 720)
  assert.equal(selectPreferredVariant(variants, 'smallest')?.height, 360)
  assert.equal(selectPreferredVariant([], 'highest'), undefined)
})

test('uses portrait short edge, lower fallback, and smallest when all exceed cap', () => {
  const portrait = normalizeVariants([
    variant('1080x1920'),
    variant('720x1280'),
    variant('360x640'),
  ])
  assert.equal(selectPreferredVariant(portrait, '720p')?.width, 720)
  assert.equal(
    selectPreferredVariant(
      variants.filter(item => item.height !== 1080),
      '1080p',
    )?.height,
    720,
  )
  assert.equal(
    selectPreferredVariant(variants.slice(0, 2), '720p')?.height,
    1080,
  )
})

test('ignores unknown dimensions when choosing a small known version', () => {
  assert.equal(
    selectPreferredVariant(
      normalizeVariants([
        ...variants,
        { url: 'https://video.twimg.com/video.mp4' },
      ]),
      'smallest',
    )?.height,
    360,
  )
})

test('smallest quality preserves tied order without changing the input variants', () => {
  const input = normalizeVariants([
    variant('640x360', 300000),
    variant('1920x1080', 300000),
  ])
  const original = structuredClone(input)
  assert.equal(selectPreferredVariant(input, 'smallest')?.height, 1080)
  assert.deepEqual(input, original)
})

test('formats binary byte boundaries and keeps the localized unknown label', () => {
  for (const [bytes, expected] of [
    [0, '0 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [1024 ** 2, '1.0 MB'],
    [1024 ** 3, '1024.0 MB'],
  ] as const) {
    assert.equal(formatBytes(bytes), expected)
  }
  for (const bytes of [-1, Number.NaN, Infinity]) {
    assert.equal(
      formatBytes(bytes, 'Unknown in this locale'),
      'Unknown in this locale',
    )
  }
})

test('validates templates and preserves safe fallbacks for missing metadata', () => {
  for (const template of [
    '',
    '../{postId}',
    'folder/{postId}',
    '{unknown}',
    '{postId',
    'bad\nname',
    'x'.repeat(161),
  ]) {
    assert.notEqual(validateFilenameTemplate(template), '', template)
  }
  const request = {
    type: 'download-video' as const,
    postId: '123',
    mediaIndex: 1,
    url: variant('1280x720').url,
  }
  assert.equal(
    buildFilename(request, DEFAULT_FILENAME_TEMPLATE),
    'unknown_undated_123_1_1280x720.mp4',
  )
  assert.equal(buildFilename(request, 'CON'), '_CON.mp4')
  assert.equal(buildFilename(request, '{postId}.mp4'), '123.mp4')
  assert.ok(
    new TextEncoder().encode(buildFilename(request, '中'.repeat(150))).length
      <= 204,
  )
  assert.equal(normalizePreferences({ quality: 'invalid' }).quality, 'highest')
})

test('batch requests must target one post with distinct valid media positions', () => {
  const one = {
    type: 'download-video',
    postId: '123',
    mediaIndex: 1,
    url: variant('1280x720').url,
  }
  assert.equal(
    normalizeBatchRequest({
      type: 'download-videos',
      requests: [one, { ...one, mediaIndex: 2 }],
    })?.length,
    2,
  )
  for (const requests of [
    [],
    [one, one],
    [one, { ...one, postId: '456', mediaIndex: 2 }],
    [{ ...one, url: 'https://evil.test/a.mp4' }],
  ]) {
    assert.equal(
      normalizeBatchRequest({ type: 'download-videos', requests }),
      undefined,
    )
  }
})

test('keeps author and creation date when revisiting the nested legacy object', () => {
  const posts = extractVideoPosts({
    rest_id: '123',
    core: { user_results: { result: { legacy: { screen_name: 'ntnyq' } } } },
    legacy: {
      id_str: '123',
      created_at: 'Fri Oct 02 12:00:00 +0000 2026',
      extended_entities: {
        media: [
          {
            id_str: '1',
            type: 'video',
            video_info: { variants: [variant('1280x720')] },
          },
        ],
      },
    },
  })
  assert.equal(posts[0]?.author, 'ntnyq')
  assert.equal(posts[0]?.createdAt, '2026-10-02T12:00:00.000Z')
})

test('reads author from user core even when legacy contains other fields', () => {
  const posts = extractVideoPosts({
    rest_id: '123',
    core: {
      user_results: {
        result: {
          core: { screen_name: 'ntnyq' },
          legacy: { description: 'Sample author' },
        },
      },
    },
    legacy: {
      id_str: '123',
      extended_entities: {
        media: [
          {
            id_str: '1',
            type: 'video',
            video_info: { variants: [variant('1280x720')] },
          },
        ],
      },
    },
  })
  assert.equal(posts[0]?.author, 'ntnyq')
})
