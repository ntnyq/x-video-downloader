import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isAllowedSender, normalizeDownloadRequest } from '../utils/download'
import {
  extractVideoPosts,
  getPostId,
  isRecord,
  normalizeMediaUrl,
  normalizePost,
  normalizeVariants,
} from '../utils/video'

const URL_HD =
  'https://video.twimg.com/ext_tw_video/1/pu/vid/avc1/1280x720/high.mp4?tag=12'
const URL_SD = 'https://video.twimg.com/ext_tw_video/1/pu/vid/640x360/low.mp4'
const URL_HLS = 'https://video.twimg.com/ext_tw_video/1/pu/pl/master.m3u8'

export function tweet(id: string, type = 'video') {
  return {
    rest_id: id,
    legacy: {
      id_str: id,
      full_text: '测试视频',
      extended_entities: {
        media: [
          {
            id_str: '111',
            type,
            video_info: {
              variants: [
                { url: URL_SD, bitrate: 256000 },
                { url: URL_HD, bitrate: 2176000 },
                { url: URL_HLS, content_type: 'application/x-mpegURL' },
              ],
            },
          },
        ],
      },
    },
  }
}

test('keeps large snowflake IDs as strings and supports video routes', () => {
  assert.equal(
    getPostId('https://x.com/ntnyq/status/2105974296740811141/video/2'),
    '2105974296740811141',
  )
  assert.equal(getPostId('https://mobile.twitter.com/a/status/123'), '123')
  for (const url of [
    'https://x.com.evil.test/a/status/123',
    'https://x.com/a/status/123abc',
    'http://x.com/a/status/123',
  ]) {
    assert.equal(getPostId(url), undefined)
  }
})

test('only accepts HTTPS MP4 media from the exact video host', () => {
  assert.equal(normalizeMediaUrl(`${URL_HD}#fragment`), URL_HD)
  for (const url of [
    'blob:https://x.com/id',
    URL_HLS,
    'https://video.twimg.com.evil.test/a.mp4',
    'https://user@video.twimg.com/a.mp4',
    'https://video.twimg.com:8080/a.mp4',
    'https://x.com/a.mp4',
    'javascript:alert(1)',
  ]) {
    assert.equal(normalizeMediaUrl(url), undefined, url)
  }
})

test('deduplicates, excludes HLS and sorts MP4s by pixels then bitrate', () => {
  const variants = normalizeVariants([
    { url: URL_SD },
    { url: URL_HD, bitrate: 2000000 },
    { url: URL_HD, bitrate: 2000000 },
    { url: URL_HLS },
    null,
  ])
  assert.equal(variants.length, 2)
  assert.equal(variants[0]?.url, URL_HD)
  assert.equal(variants[0]?.width, 1280)
})

test('keeps latest duplicate metadata and stable ordering for equal qualities', () => {
  const otherHd = URL_HD.replace('high.mp4', 'other.mp4')
  const input = [
    { url: URL_HD, bitrate: 1 },
    { url: otherHd, bitrate: 2 },
    { url: URL_SD, bitrate: 9 },
    { url: URL_HD, bitrate: 2 },
  ]
  const original = structuredClone(input)
  const variants = normalizeVariants(input)
  assert.deepEqual(
    variants.map(variant => variant.url),
    [URL_HD, otherHd, URL_SD],
  )
  assert.equal(variants[0]?.bitrate, 2)
  assert.deepEqual(input, original)
})

test('record boundaries reject arrays and callable objects with valid-looking fields', () => {
  const callable = Object.assign(() => {}, {
    type: 'download-video',
    postId: '123',
    mediaIndex: 1,
    url: URL_HD,
    id: '123',
    media: [{ variants: [{ url: URL_HD }] }],
  })
  for (const value of [null, [], callable]) {
    assert.equal(isRecord(value), false)
    assert.equal(normalizePost(value), undefined)
    assert.equal(normalizeDownloadRequest(value), undefined)
  }
})

test('extracts timeline, quote, retweet, GIF and multiple media independently', () => {
  const own = tweet('2105974296740811141')
  const quote = tweet('2105974296740811142', 'animated_gif')
  own.legacy.extended_entities.media.push({
    ...own.legacy.extended_entities.media[0]!,
    id_str: '222',
  })
  const posts = extractVideoPosts({
    timeline: [{ result: { ...own, quoted_status_result: { result: quote } } }],
    retweet: { result: tweet('2105974296740811143') },
  })
  assert.equal(posts.length, 3)
  assert.equal(posts.find(post => post.id === own.rest_id)?.media.length, 2)
  assert.equal(posts.find(post => post.id === quote.rest_id)?.media.length, 1)
  assert.equal(
    posts.every(post => post.media[0]?.variants[0]?.url === URL_HD),
    true,
  )
})

test('keeps HLS-only posts visible with no fake MP4', () => {
  const post = normalizePost({
    id: '123',
    media: [{ id: '1', variants: [{ url: URL_HLS }], hasHls: true }],
  })
  assert.equal(post?.media[0]?.hasHls, true)
  assert.deepEqual(post?.media[0]?.variants, [])
})

test('rejects malformed records and ignores images and numeric IDs', () => {
  assert.equal(normalizePost({ id: 123, media: [] }), undefined)
  assert.equal(
    normalizePost({
      id: '123',
      media: [{ variants: [{ url: 'https://evil.test/a.mp4' }] }],
    }),
    undefined,
  )
  assert.deepEqual(extractVideoPosts(tweet('123', 'photo')), [])
})

test('handles cyclic and malformed response payloads without hanging', () => {
  const cyclic: Record<string, unknown> = { child: tweet('123') }
  cyclic['self'] = cyclic
  assert.equal(extractVideoPosts(cyclic).length, 1)
  assert.deepEqual(
    extractVideoPosts({ legacy: null, entities: { media: [null, false] } }),
    [],
  )
})

test('validates download filenames and media positions at the background boundary', () => {
  const valid = {
    type: 'download-video',
    postId: '123',
    mediaIndex: 2,
    url: URL_HD,
  }
  assert.deepEqual(normalizeDownloadRequest(valid), valid)
  for (const mediaIndex of [0, 17, 1.5, '1', null]) {
    assert.equal(normalizeDownloadRequest({ ...valid, mediaIndex }), undefined)
  }
  assert.equal(
    normalizeDownloadRequest({ ...valid, postId: '../test' }),
    undefined,
  )
  assert.equal(normalizeDownloadRequest({ ...valid, url: URL_HLS }), undefined)
})

test('accepts only this extension popup or an X content script', () => {
  const popup = 'chrome-extension://extension-id/popup.html'
  assert.equal(
    isAllowedSender({ id: 'extension-id', url: popup }, 'extension-id', popup),
    true,
  )
  assert.equal(
    isAllowedSender(
      { id: 'extension-id', url: 'https://x.com/home', tab: {} },
      'extension-id',
      popup,
    ),
    true,
  )
  assert.equal(
    isAllowedSender({ id: 'other', url: popup }, 'extension-id', popup),
    false,
  )
  assert.equal(
    isAllowedSender(
      { id: 'extension-id', url: 'https://example.com', tab: {} },
      'extension-id',
      popup,
    ),
    false,
  )
})
