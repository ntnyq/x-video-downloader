import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { test } from 'node:test'
import {
  createBroadcastCapture,
  normalizeBroadcastReplay,
} from '../utils/replay/broadcast'
import {
  ReplayFormatError,
  ReplayLimitError,
  ReplayStorageError,
  ReplayUnfinishedError,
} from '../utils/replay/errors'
import { validateReplayMp4Output } from '../utils/replay/mp4'
import {
  alignReplayTransportSegments,
  decodeReplayPlaylist,
  MAX_REPLAY_SEGMENTS,
  parseReplayTrack,
  selectReplayVariant,
} from '../utils/replay/playlist'
import {
  getReplayStorageBudget,
  isReplayQuotaError,
} from '../utils/replay/storage'
import { validateReplayTransportSegment } from '../utils/replay/transport'
import { extractBroadcastIdFromUrl } from '../utils/video/identity'
import { extractVideoPosts } from '../utils/video/posts'
import { normalizeMediaUrl } from '../utils/video/variants'
import type { BroadcastReplay } from '../utils/replay/broadcast'

const id = '2POrzNVOKzVLpg'
const metadataUrl = 'https://x.com/i/api/graphql/example/BroadcastQuery'
const streamUrl = 'https://x.com/i/api/1.1/live_video_stream/status/28_123'
const playlist = 'https://video.twimg.com/replay/master.m3u8?source=example'
const broadcast = {
  broadcast_id: id,
  media_key: '28_123',
  state: 'ENDED',
  available_for_replay: true,
  status: 'An archived broadcast',
}

test('reports malformed UTF-8 playlists as unsupported replay data', () => {
  assert.equal(
    decodeReplayPlaylist(new TextEncoder().encode('#EXTM3U\n')),
    '#EXTM3U\n',
  )
  assert.throws(
    () => decodeReplayPlaylist(Uint8Array.of(0xff)),
    ReplayFormatError,
  )
})

test('requires AAC in a replay output when the playlist declares audio', async () => {
  function box(type: string, ...payload: Uint8Array[]) {
    const size = 8 + payload.reduce((total, bytes) => total + bytes.length, 0)
    const header = Buffer.alloc(8)

    header.writeUInt32BE(size)
    header.write(type, 4)

    return Buffer.concat([header, ...payload])
  }

  function track(codec: string) {
    const stsd = box('stsd', Buffer.from([0, 0, 0, 0, 0, 0, 0, 1]), box(codec))

    return box('trak', box('mdia', box('minf', box('stbl', stsd))))
  }

  function output(...codecs: string[]) {
    return new Blob([
      box('ftyp'),
      box('moov', box('mvex'), ...codecs.map(track)),
      box('moof'),
      box('mdat'),
    ])
  }

  await validateReplayMp4Output(output('avc3', 'mp4a'), true)
  await validateReplayMp4Output(output('avc1'), false)
  await assert.rejects(
    validateReplayMp4Output(output('avc1'), true),
    ReplayFormatError,
  )
  await assert.rejects(
    validateReplayMp4Output(output('avc1', 'ac-3'), true),
    ReplayFormatError,
  )
  await assert.rejects(
    validateReplayMp4Output(output('mp4a'), true),
    ReplayFormatError,
  )
  await assert.rejects(
    validateReplayMp4Output(output('avc1').slice(0, 20), false),
    ReplayFormatError,
  )
})

test('joins completed broadcasts and their captured source in either response order', () => {
  const tasks = [
    [metadataUrl, { data: { broadcast } }],
    [streamUrl, { source: { noRedirectPlaybackUrl: playlist } }],
  ] as const

  for (const pair of [tasks, [...tasks].reverse()]) {
    const replays: BroadcastReplay[] = []
    const { handleResponse } = createBroadcastCapture(replay =>
      replays.push(replay),
    )

    for (const [url, data] of pair) {
      handleResponse(url, data)
    }

    assert.equal(replays.length, 1)
    assert.deepEqual(replays[0], {
      post: {
        id: `broadcast-${id}`,
        broadcastId: id,
        text: broadcast.status,
        media: [],
      },
      playlist,
    })
    assert.equal(normalizeBroadcastReplay(replays[0])?.playlist, playlist)
  }
})

test('ignores live, unrelated, and off-domain playback sources', () => {
  const replays: BroadcastReplay[] = []
  const { handleResponse } = createBroadcastCapture(replay =>
    replays.push(replay),
  )

  handleResponse(metadataUrl, {
    data: { broadcast: { ...broadcast, state: 'RUNNING' } },
  })
  handleResponse(streamUrl, { source: { location: playlist } })
  assert.equal(replays.length, 0)

  handleResponse(metadataUrl, {
    data: { broadcast: { ...broadcast, media_key: '28_456' } },
  })
  handleResponse('https://x.com/i/api/1.1/live_video_stream/status/28_456', {
    source: { location: 'https://video.twimg.com.example.com/replay.m3u8' },
  })
  assert.equal(replays.length, 0)
})

test('associates a timeline broadcast card with the same ID used on its standalone page', () => {
  const url = `https://x.com/i/broadcasts/${id}`
  const posts = extractVideoPosts({
    rest_id: '123',
    legacy: { full_text: 'Replay' },
    card: {
      legacy: {
        name: '123:broadcast',
        binding_values: [
          { key: 'broadcast_url', value: { string_value: url } },
        ],
      },
    },
  })

  assert.deepEqual(posts, [
    {
      id: '123',
      text: 'Replay',
      media: [],
      author: undefined,
      createdAt: undefined,
      relatedBroadcastId: extractBroadcastIdFromUrl(url),
    },
  ])
  assert.equal(
    extractBroadcastIdFromUrl(`https://example.org/i/broadcasts/${id}`),
    undefined,
  )
})

test('honors the selected quality and resolves the default audio rendition', () => {
  const master = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English, main",DEFAULT=YES,URI="main.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Japanese",DEFAULT=NO,URI="alternate.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1080x1920,CODECS="avc1.640029,mp4a.40.2",AUDIO="audio"
large.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1100000,RESOLUTION=720x1280,CODECS="avc1.64001F,mp4a.40.2",AUDIO="audio"
mid.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=360x640,CODECS="av01.0.04M.08"
alternate-codec.m3u8
`
  const full = selectReplayVariant(master, playlist, 'highest')
  const capped = selectReplayVariant(master, playlist, '720p')

  assert.equal(full?.height, 1920)
  assert.equal(capped?.videoUrl, 'https://video.twimg.com/replay/mid.m3u8')
  assert.equal(capped?.audioUrl, 'https://video.twimg.com/replay/main.m3u8')
  assert.equal(capped?.audioRequired, true)
  assert.equal(selectReplayVariant(master, playlist, 'smallest')?.width, 720)
  assert.throws(
    () =>
      selectReplayVariant(
        master.replace('DEFAULT=YES', 'DEFAULT=NO'),
        playlist,
        'highest',
      ),
    ReplayFormatError,
  )
  assert.throws(
    () =>
      selectReplayVariant(
        master.replace('large.m3u8', '//example.com/large.m3u8'),
        playlist,
        'highest',
      ),
    ReplayFormatError,
  )
})

test('retries another rendition in preference order without revisiting failed renditions', () => {
  const master = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="fallback",DEFAULT=YES,URI="fallback-audio.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=1200000,RESOLUTION=848x480
large.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=600000,RESOLUTION=568x320,AUDIO="fallback"
medium.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=420x240,AUDIO="missing"
unsupported.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=300000,RESOLUTION=320x180
small.m3u8
`
  const first = selectReplayVariant(master, playlist, 'smallest')

  assert.equal(first?.videoUrl, new URL('small.m3u8', playlist).href)
  assert.deepEqual(first?.segmentPlaylistUrls, [
    new URL('large.m3u8', playlist).href,
  ])
  assert.deepEqual(first?.retry?.rendition, {
    width: 568,
    height: 320,
    bitrate: 600000,
  })

  const second = selectReplayVariant(master, playlist, 'smallest', first?.retry)

  assert.equal(second?.videoUrl, new URL('medium.m3u8', playlist).href)
  assert.equal(second?.audioUrl, new URL('fallback-audio.m3u8', playlist).href)

  const third = selectReplayVariant(master, playlist, 'smallest', second?.retry)

  assert.equal(third?.videoUrl, new URL('large.m3u8', playlist).href)
  assert.equal(third?.retry, undefined)
  assert.throws(
    () =>
      selectReplayVariant(
        master.replace('medium.m3u8', 'updated.m3u8'),
        playlist,
        'smallest',
        first?.retry,
      ),
    ReplayFormatError,
  )
})

test('chooses a playable quality when the preferred rendition has no usable audio group', () => {
  const master = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1200000,RESOLUTION=848x480,AUDIO="missing"
preferred.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=600000,RESOLUTION=568x320
playable.m3u8
`

  const selected = selectReplayVariant(master, playlist, 'highest')

  assert.equal(selected?.videoUrl, new URL('playable.m3u8', playlist).href)
  assert.equal(selected?.retry, undefined)
})

test('rejects truncated or misaligned transport packets before conversion', () => {
  const complete = new Uint8Array(376)

  complete[0] = 0x47
  complete[188] = 0x47
  assert.doesNotThrow(() => validateReplayTransportSegment(complete))
  assert.throws(
    () => validateReplayTransportSegment(complete.subarray(0, 375)),
    ReplayFormatError,
  )
  assert.throws(
    () => validateReplayTransportSegment(new Uint8Array(188)),
    ReplayFormatError,
  )
})

test('pairs independent transport segments by start time and duration across renditions', () => {
  const track = `#EXTM3U
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-PROGRAM-DATE-TIME:2026-11-02T14:58:06.395Z
#EXTINF:4.166,
one.ts
#EXT-X-PROGRAM-DATE-TIME:2026-11-02T14:58:10.559Z
#EXTINF:4.167,
two.ts
#EXT-X-ENDLIST
`
  const backup = track
    .replace('4.166,', '2.000,')
    .replace('two.ts', 'backup.ts')
  const primary = parseReplayTrack(track, playlist)

  assert.deepEqual(
    alignReplayTransportSegments(primary, parseReplayTrack(backup, playlist)),
    [undefined, new URL('backup.ts', playlist).href],
  )
  assert.deepEqual(
    alignReplayTransportSegments(
      primary,
      parseReplayTrack(
        backup.replace(
          '#EXT-X-PROGRAM-DATE-TIME:2026-11-02T14:58:06.395Z\n#EXTINF:2.000,\none.ts\n',
          '',
        ),
        playlist,
      ),
    ),
    [undefined, new URL('backup.ts', playlist).href],
  )
  assert.equal(
    alignReplayTransportSegments(
      primary,
      parseReplayTrack(
        backup.replace('#EXT-X-INDEPENDENT-SEGMENTS', ''),
        playlist,
      ),
    ),
    undefined,
  )
})

const media = `#EXTM3U
#EXT-X-PLAYLIST-TYPE:VOD
#EXT-X-TARGETDURATION:2
#EXT-X-MAP:URI="init.mp4?key=example"
#EXTINF:2,
parts/0001.m4s
#EXTINF:1.5,
parts/0002.m4s
#EXT-X-ENDLIST
`

test('keeps initialization and media segments in playlist order', () => {
  assert.equal(selectReplayVariant(media, playlist, 'highest'), undefined)
  assert.deepEqual(parseReplayTrack(media, playlist), {
    init: 'https://video.twimg.com/replay/init.mp4?key=example',
    segments: [
      'https://video.twimg.com/replay/parts/0001.m4s',
      'https://video.twimg.com/replay/parts/0002.m4s',
    ],
  })
})

test('rejects unfinished and unsupported media playlists', () => {
  assert.throws(
    () => parseReplayTrack(media.replace('#EXT-X-ENDLIST', ''), playlist),
    ReplayUnfinishedError,
  )
  assert.throws(
    () => parseReplayTrack(media.replace('TYPE:VOD', 'TYPE:EVENT'), playlist),
    ReplayUnfinishedError,
  )

  for (const invalid of [
    media.replace('parts/0001.m4s', '//example.com/video.m4s'),
    media.replace('parts/0001.m4s', 'https://video.twimg.com:9999/video.m4s'),
    media.replace('parts/0001.m4s', 'https://name@video.twimg.com/video.m4s'),
    media.replace('parts/0001.m4s', 'video.ts'),
    media.replace(
      '#EXTINF:2,',
      '#EXT-X-KEY:METHOD=AES-128,URI="key"\n#EXTINF:2,',
    ),
    media.replace('#EXTINF:2,', '#EXT-X-DISCONTINUITY\n#EXTINF:2,'),
    media.replace('#EXTINF:2,', '#EXT-X-BYTERANGE:1000@0\n#EXTINF:2,'),
    media.replace('#EXTINF:1.5,', '#EXT-X-MAP:URI="second.mp4"\n#EXTINF:1.5,'),
  ]) {
    assert.throws(() => parseReplayTrack(invalid, playlist), ReplayFormatError)
  }
})

test('accepts a long replay while bounding playlist complexity', () => {
  const track = (count: number) =>
    [
      '#EXTM3U',
      '#EXT-X-MAP:URI="init.mp4"',
      ...Array.from(
        { length: count },
        (_, index) => `#EXTINF:4,
part-${index}.m4s`,
      ),
      '#EXT-X-ENDLIST',
    ].join('\n')

  assert.equal(parseReplayTrack(track(2160), playlist).segments.length, 2160)
  assert.throws(
    () => parseReplayTrack(track(MAX_REPLAY_SEGMENTS + 1), playlist),
    ReplayLimitError,
  )
})

test('selects and parses the finished Periscope transport stream layout', () => {
  const url = 'https://prod-fastly-p.video.pscp.tv/replay/master.m3u8'
  const master = [
    '#EXTM3U',
    '#EXT-X-DYNAMICALLY-GENERATED',
    '#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2"',
    '720p.m3u8',
    '#EXT-X-STREAM-INF:BANDWIDTH=1200000,RESOLUTION=848x480,CODECS="avc1.64001e,mp4a.40.2"',
    '480p.m3u8',
    '#EXT-X-STREAM-INF:BANDWIDTH=600000,RESOLUTION=568x320,CODECS="avc1.640015,mp4a.40.2"',
    '320p.m3u8',
  ].join('\n')
  const videoUrl = 'https://prod-fastly-p.video.pscp.tv/replay/720p.m3u8'
  const media = [
    '#EXTM3U',
    '#EXT-X-PLAYLIST-TYPE:VOD',
    '#EXT-X-INDEPENDENT-SEGMENTS',
    '#EXTINF:4.2,',
    'one.ts',
    '#EXTINF:4.1,',
    'two.ts',
    '#EXT-X-ENDLIST',
  ].join('\n')

  assert.equal(selectReplayVariant(master, url, 'highest')?.videoUrl, videoUrl)
  assert.equal(selectReplayVariant(master, url, '480p')?.height, 480)
  assert.equal(selectReplayVariant(master, url, '360p')?.height, 320)
  assert.deepEqual(parseReplayTrack(media, videoUrl), {
    segments: [
      'https://prod-fastly-p.video.pscp.tv/replay/one.ts',
      'https://prod-fastly-p.video.pscp.tv/replay/two.ts',
    ],
  })
  assert.throws(
    () =>
      parseReplayTrack(
        media.replace('two.ts', 'https://video.twimg.com/two.ts'),
        videoUrl,
      ),
    ReplayFormatError,
  )
  assert.equal(
    normalizeMediaUrl('https://prod-fastly-p.video.pscp.tv/replay/file.mp4'),
    undefined,
  )
})

test('uses the remaining browser quota to budget input and assembly separately', () => {
  const gib = 1024 ** 3

  assert.equal(getReplayStorageBudget({ quota: 8 * gib, usage: 4 * gib }), gib)
  assert.equal(
    getReplayStorageBudget({ quota: 8 * gib, usage: 5 * gib }, true),
    gib,
  )
  assert.equal(getReplayStorageBudget({ quota: 5 * gib, usage: 6 * gib }), 0)
  assert.throws(() => getReplayStorageBudget({ quota: 0 }), ReplayStorageError)
  assert.throws(
    () => getReplayStorageBudget({ quota: Infinity, usage: 0 }),
    ReplayStorageError,
  )
})

test('recognizes quota failures from the browser and media worker', () => {
  const quota = new DOMException('Storage is full', 'QuotaExceededError')
  const workerQuota = Object.assign(new Error('Storage is full'), {
    name: 'QuotaExceededError',
  })

  assert.equal(isReplayQuotaError(quota), true)
  assert.equal(
    isReplayQuotaError(
      new AggregateError([workerQuota], 'Worker cleanup failed'),
    ),
    true,
  )
  assert.equal(
    isReplayQuotaError(new DOMException('Aborted', 'AbortError')),
    false,
  )
})
