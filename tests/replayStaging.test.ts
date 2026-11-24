import assert from 'node:assert/strict'
import { test } from 'node:test'
import { stageReplay } from '../entrypoints/replay/stageReplay'

test('stages an aligned backup segment and records the rendition switch for remuxing', async context => {
  const master = 'https://video.twimg.com/replay/master.m3u8'
  const media = `#EXTM3U
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-PROGRAM-DATE-TIME:2026-11-02T14:58:06Z
#EXTINF:4,
first.ts
#EXT-X-PROGRAM-DATE-TIME:2026-11-02T14:58:10Z
#EXTINF:4,
second.ts
#EXT-X-ENDLIST
`
  const first = new Uint8Array(376)
  const backup = new Uint8Array(188)

  first[0] = 0x47
  first[188] = 0x47
  backup[0] = 0x47
  backup[1] = 0x01

  const responses = new Map<string, BodyInit>([
    [
      'master.m3u8',
      `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1200000,RESOLUTION=848x480
primary.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=600000,RESOLUTION=568x320
backup.m3u8
`,
    ],
    ['primary.m3u8', media],
    ['backup.m3u8', media.replace('second.ts', 'backup.ts')],
    ['first.ts', first],
    ['second.ts', new Uint8Array(188)],
    ['backup.ts', backup],
  ])
  const requested: string[] = []
  const written: Uint8Array<ArrayBuffer>[] = []
  const progress: number[] = []

  context.mock.method(globalThis, 'fetch', (url: string) => {
    const resource = url.slice(new URL('.', master).href.length)
    const body = responses.get(resource)

    assert.ok(body, `Unexpected replay resource: ${url}`)
    requested.push(resource)

    return Promise.resolve(new Response(body))
  })

  const directory = {
    getFileHandle(name: string) {
      assert.equal(name, 'video.ts')

      return {
        createWritable() {
          return {
            write: (bytes: Uint8Array<ArrayBuffer>) => written.push(bytes),
            close: () => {},
            abort: () => Promise.resolve(),
          }
        },
        getFile: () => new File(written, name),
      }
    },
  } as unknown as FileSystemDirectoryHandle

  const staged = await stageReplay(master, directory, {
    quality: 'highest',
    inputBudget: first.byteLength + backup.byteLength,
    signal: new AbortController().signal,
    onProgress: ({ completed }) => progress.push(completed),
  })

  assert.ok(!(staged.video instanceof Blob))
  assert.deepEqual(staged.video.segmentOffsets, [0, first.byteLength])
  assert.deepEqual(staged.video.renditionSwitches, [1])
  assert.equal(staged.stagedBytes, first.byteLength + backup.byteLength)
  assert.deepEqual(written, [first, backup])
  assert.deepEqual(progress, [0, 1, 2])
  assert.deepEqual(requested, [
    'master.m3u8',
    'primary.m3u8',
    'first.ts',
    'second.ts',
    'backup.m3u8',
    'backup.ts',
  ])
})
