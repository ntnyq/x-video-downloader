import { MAX_MEDIA_URL_LENGTH, MAX_VIDEO_VARIANTS } from '../../constants/video'
import {
  ReplayFormatError,
  ReplayLimitError,
  ReplayUnfinishedError,
} from './errors'
import { normalizeReplayUrl } from './url'
import type { QualityPreference } from '../../types/download'

/**
 * Maximum number of media segments in a replay download across video and audio tracks.
 */
export const MAX_REPLAY_SEGMENTS = 16_384

/**
 * Maximum combined length of resolved segment URLs per track in UTF-16 code units.
 */
const MAX_RESOLVED_SEGMENT_URL_LENGTH = 8 * 1024 * 1024

/**
 * Quality choices for live replays, including lower resolution caps.
 */
export type ReplayQualityPreference = QualityPreference | '360p' | '480p'

/**
 * Validated resources for a single fragmented MP4 or MPEG-TS playlist.
 */
export interface ReplayTrack {
  /**
   * Initialization segment URL for fragmented MP4 playlists. MPEG-TS playlists omit it.
   */
  init?: string
  /**
   * Absolute media segment URLs in playback order.
   */
  segments: string[]
  /** Wall-clock starts and durations for independently decodable TS segments. */
  transportTimeline?: { start: number; duration: number }[]
}

/**
 * Candidate video rendition from a replay master playlist.
 */
interface ReplayVariant {
  /**
   * Absolute URL of the video media playlist.
   */
  videoUrl: string
  /**
   * Audio group identifier referenced by the stream, when declared.
   */
  audioGroup?: string
  /**
   * Whether the variant's codec declaration includes supported AAC audio.
   */
  audioRequired: boolean
  /**
   * Declared frame width in pixels, or zero when unknown.
   */
  width: number
  /**
   * Declared frame height in pixels, or zero when unknown.
   */
  height: number
  /**
   * Declared bandwidth in bits per second.
   */
  bitrate: number
}

/**
 * Display information for a rendition advertised by the replay master playlist.
 */
export type ReplayRendition = Pick<
  ReplayVariant,
  'width' | 'height' | 'bitrate'
>

/**
 * The next rendition that can be tried after a replay segment fails.
 */
export interface ReplayRenditionRetry {
  /**
   * Candidate video playlist URL, verified again against the master on retry.
   */
  videoUrl: string
  /**
   * Display information for the candidate.
   */
  rendition: ReplayRendition
  /**
   * Renditions that have already failed during this sequence of attempts.
   */
  failedUrls: readonly string[]
}

/**
 * Audio choice advertised by a replay master playlist.
 */
interface AudioRendition {
  /**
   * Identifier of the audio group containing this rendition.
   */
  group: string
  /**
   * Whether the playlist marks this rendition as the group's default.
   */
  isDefault: boolean
  /**
   * Absolute URL of a separate audio playlist, when one is provided.
   */
  url?: string
}

/** Decodes an HLS playlist, reporting invalid UTF-8 as an unsupported format. */
export function decodeReplayPlaylist(bytes: Uint8Array<ArrayBuffer>) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (error) {
    throw new ReplayFormatError(undefined, { cause: error })
  }
}

/**
 * Stops parsing when a replay contains malformed or unsupported data.
 *
 * @throws {ReplayFormatError} Always.
 */
function throwReplayFormatError(): never {
  throw new ReplayFormatError()
}

/**
 * Validates the HLS header and removes blank lines from a playlist.
 *
 * @param body - Decoded playlist text.
 * @returns Nonempty playlist lines in their original order, excluding the header.
 * @throws {ReplayFormatError} When the HLS header is missing or invalid.
 */
function readPlaylistLines(body: string): string[] {
  const [header, ...lines] = body.split(/\r?\n/).filter(Boolean)

  if (header !== '#EXTM3U') {
    throwReplayFormatError()
  }

  return lines
}

/**
 * Parses the comma-separated attribute list of an HLS tag.
 *
 * @param value - Attribute list with the tag prefix removed.
 * @returns Unique attribute names and their unquoted values.
 * @throws {ReplayFormatError} When the list is empty, malformed, or repeats a name.
 */
function parseTagAttributes(value: string) {
  const items = new Map<string, string>()
  const pattern = /([A-Z0-9-]+)=("[^"\r\n]*"|[^",\s]+)(,|$)/gy
  let end = 0

  for (const match of value.matchAll(pattern)) {
    const [, key, item, separator] = match

    if (!key || !item || items.has(key)) {
      throwReplayFormatError()
    }

    items.set(key, item.startsWith('"') ? item.slice(1, -1) : item)
    end = match.index + match[0].length

    if (separator && end === value.length) {
      throwReplayFormatError()
    }
  }

  if (!end || end !== value.length) {
    throwReplayFormatError()
  }

  return items
}

/**
 * Resolves a replay URI and validates the URL against the allowed host and file formats.
 *
 * @param value - Absolute or relative URI from the playlist.
 * @param base - URL of the playlist containing the URI.
 * @param kind - Resource type used to validate the file extension.
 * @returns An absolute HTTPS URL with any fragment removed.
 * @throws {ReplayFormatError} When the URI or resolved resource is unsupported.
 */
function resolveUrl(value: string, base: string, kind: 'playlist' | 'segment') {
  if (value.length > MAX_MEDIA_URL_LENGTH || /[\s\\]/.test(value)) {
    throwReplayFormatError()
  }

  try {
    const url = new URL(value, base)
    const normalized = normalizeReplayUrl(url.href, kind)

    if (normalized && url.origin === new URL(base).origin) {
      return normalized
    }
  } catch {}

  throwReplayFormatError()
}

/**
 * Recognizes comments and metadata that both master and media parsers can skip.
 *
 * @param line - Nonempty playlist line.
 * @returns Whether the line can be ignored by either parser.
 */
function isIgnorablePlaylistLine(line: string) {
  return (
    line.startsWith('#')
    && (!line.startsWith('#EXT')
      || /^#EXT-X-VERSION:\d+$/.test(line)
      || line === '#EXT-X-INDEPENDENT-SEGMENTS')
  )
}

/**
 * Orders compatible variants by frame area and bandwidth before applying the quality preference.
 *
 * @param variants - Compatible variants to sort in place.
 * @param quality - Requested resolution preference or bandwidth priority.
 * @returns The variant that best matches the preference.
 * @throws {ReplayFormatError} When there are no compatible variants.
 */
function selectVariant<T extends ReplayVariant>(
  variants: T[],
  quality: ReplayQualityPreference,
) {
  const byResolution = variants.sort(
    (a, b) => b.width * b.height - a.width * a.height || b.bitrate - a.bitrate,
  )
  const highest = byResolution[0]

  if (!highest) {
    return throwReplayFormatError()
  }

  if (quality === 'smallest') {
    return byResolution.reduce((smallest, variant) =>
      variant.bitrate < smallest.bitrate ? variant : smallest,
    )
  }

  if (quality === 'highest') {
    return highest
  }

  const cap = Number(quality.slice(0, -1))
  const known = byResolution.filter(variant => variant.width && variant.height)

  return (
    known.find(variant => Math.min(variant.width, variant.height) <= cap)
    ?? known.at(-1)
    ?? highest
  )
}

/**
 * Resolves the default or sole audio rendition in a variant's audio group.
 * @param variant - Video rendition from the master playlist.
 * @param audio - Audio renditions from the same playlist.
 * @returns The resolved variant, or undefined when the group is ambiguous or missing.
 */
function resolveVariantAudio(variant: ReplayVariant, audio: AudioRendition[]) {
  const group = audio.filter(item => item.group === variant.audioGroup)
  const defaults = group.filter(item => item.isDefault)
  const selected =
    defaults.length === 1
      ? defaults[0]
      : group.length === 1
        ? group[0]
        : undefined

  if (!variant.audioGroup || selected) {
    return {
      ...variant,
      audioUrl: selected?.url,
      audioRequired: variant.audioRequired || Boolean(variant.audioGroup),
    }
  }
}

/**
 * Selects a compatible H.264 variant and resolves its default or sole audio rendition.
 *
 * @param body - Decoded master or media playlist text.
 * @param url - Playlist URL used to resolve child playlist references.
 * @param quality - Requested playback quality preference.
 * @param retry - Exact alternative selected on a previous failure, if available.
 * @returns The selected variant with audio and an available alternative, or undefined for a direct media playlist.
 * @throws {ReplayFormatError} When the playlist is invalid or the variant or audio selection is unsupported.
 * @throws {ReplayLimitError} When the master playlist declares too many variants or renditions.
 */
export function selectReplayVariant(
  body: string,
  url: string,
  quality: ReplayQualityPreference,
  retry?: ReplayRenditionRetry,
) {
  const lines = readPlaylistLines(body)

  if (!lines.some(line => line.startsWith('#EXT-X-STREAM-INF:'))) {
    if (retry) {
      throwReplayFormatError()
    }

    return
  }

  const variants: ReplayVariant[] = []
  const audio: AudioRendition[] = []
  let variantCount = 0
  let renditionCount = 0

  for (const [index, line] of lines.entries()) {
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      if (++variantCount > MAX_VIDEO_VARIANTS) {
        throw new ReplayLimitError()
      }

      const next = lines[index + 1]

      if (!next || next.startsWith('#')) {
        throwReplayFormatError()
      }

      const info = parseTagAttributes(line.slice('#EXT-X-STREAM-INF:'.length))
      const codecs = info
        .get('CODECS')
        ?.split(',')
        .map(codec => codec.trim())
      const bitrate = Number(info.get('BANDWIDTH'))
      const size = info.get('RESOLUTION')?.match(/^(\d{1,5})x(\d{1,5})$/)
      const audioRequired =
        codecs?.some(codec => /^mp4a\.40\.(?:2|5|29)$/i.test(codec)) ?? false

      if (
        Number.isSafeInteger(bitrate)
        && bitrate > 0
        && !info.has('VIDEO')
        && (!codecs
          || (codecs.some(codec => /^avc[13](?:\.[\da-f]{6})?$/i.test(codec))
            && codecs.every(codec =>
              /^(?:avc[13](?:\.[\da-f]{6})?|mp4a\.40\.(?:2|5|29))$/i.test(
                codec,
              ),
            )))
      ) {
        variants.push({
          videoUrl: resolveUrl(next, url, 'playlist'),
          audioGroup: info.get('AUDIO'),
          audioRequired,
          width: Number(size?.[1] ?? 0),
          height: Number(size?.[2] ?? 0),
          bitrate,
        })
      }
    } else if (line.startsWith('#EXT-X-MEDIA:')) {
      if (++renditionCount > MAX_VIDEO_VARIANTS) {
        throw new ReplayLimitError()
      }

      const info = parseTagAttributes(line.slice('#EXT-X-MEDIA:'.length))
      const group = info.get('GROUP-ID')
      const uri = info.get('URI')

      if (group && info.get('TYPE') === 'AUDIO') {
        audio.push({
          group,
          isDefault: info.get('DEFAULT') === 'YES',
          url: uri ? resolveUrl(uri, url, 'playlist') : undefined,
        })
      }
    } else if (
      !isIgnorablePlaylistLine(line)
      && !line.startsWith('#EXT-X-I-FRAME-STREAM-INF:')
      && !line.startsWith('#EXT-X-SESSION-DATA:')
      && !/^#EXT-X-DYNAMICALLY-GENERATED(?::|$)/.test(line)
      && (line.startsWith('#')
        || !lines[index - 1]?.startsWith('#EXT-X-STREAM-INF:'))
    ) {
      throwReplayFormatError()
    }
  }

  const compatible = variants.flatMap(
    variant => resolveVariantAudio(variant, audio) ?? [],
  )
  const selected = retry
    ? (compatible.find(item => item.videoUrl === retry.videoUrl)
      ?? throwReplayFormatError())
    : selectVariant(compatible, quality)
  const failedUrls = [...(retry?.failedUrls ?? []), selected.videoUrl]
  const remaining = compatible.filter(
    item => !failedUrls.includes(item.videoUrl),
  )
  const alternative = remaining.length
    ? selectVariant(remaining, quality)
    : undefined
  const segmentAlternatives = compatible.filter(
    item =>
      item.videoUrl !== selected.videoUrl
      && item.audioUrl === selected.audioUrl
      && item.audioRequired === selected.audioRequired,
  )
  const segmentPlaylistUrls = new Set<string>()

  while (segmentAlternatives.length) {
    const next = selectVariant(segmentAlternatives, quality)

    segmentPlaylistUrls.add(next.videoUrl)
    segmentAlternatives.splice(segmentAlternatives.indexOf(next), 1)
  }

  return {
    ...selected,
    segmentPlaylistUrls: [...segmentPlaylistUrls],
    retry: alternative && {
      videoUrl: alternative.videoUrl,
      rendition: {
        width: alternative.width,
        height: alternative.height,
        bitrate: alternative.bitrate,
      },
      failedUrls,
    },
  }
}

/**
 * Parses a completed fragmented MP4 or MPEG-TS playlist into its ordered resources.
 *
 * @param body - Decoded media playlist text.
 * @param url - Playlist URL used to resolve initialization and segment references.
 * @returns Validated initialization and media segment URLs in playback order.
 * @throws {ReplayUnfinishedError} When the playlist is an event or has no end marker.
 * @throws {ReplayFormatError} When the playlist contains malformed or unsupported data.
 * @throws {ReplayLimitError} When segment count or resolved URL length exceeds the track budget.
 */
export function parseReplayTrack(body: string, url: string): ReplayTrack {
  const lines = readPlaylistLines(body)

  if (
    !lines.includes('#EXT-X-ENDLIST')
    || lines.includes('#EXT-X-PLAYLIST-TYPE:EVENT')
  ) {
    throw new ReplayUnfinishedError()
  }

  let init: string | undefined
  let duration = 0
  let start = Number.NaN
  let resolvedUrlLength = 0
  let ended = false
  const segments: string[] = []
  const timeline: NonNullable<ReplayTrack['transportTimeline']> = []

  for (const line of lines) {
    if (isIgnorablePlaylistLine(line)) {
      continue
    }

    if (ended) {
      throwReplayFormatError()
    }

    if (line.startsWith('#EXT-X-MAP:')) {
      const map = parseTagAttributes(line.slice('#EXT-X-MAP:'.length))
      const uri = map.get('URI')
      const resource =
        uri && !map.has('BYTERANGE')
          ? resolveUrl(uri, url, 'segment')
          : throwReplayFormatError()

      if (
        /\.ts$/i.test(new URL(resource).pathname)
        || (init ? init !== resource : segments.length > 0)
      ) {
        throwReplayFormatError()
      }

      init = resource
    } else if (line.startsWith('#EXTINF:')) {
      const seconds = line.match(/^#EXTINF:(\d+(?:\.\d+)?),/)?.[1]

      const parsed = Number(seconds)

      if (duration || !Number.isFinite(parsed) || parsed <= 0) {
        throwReplayFormatError()
      }

      duration = parsed
    } else if (line === '#EXT-X-ENDLIST') {
      ended = true
    } else if (line.startsWith('#EXT-X-PROGRAM-DATE-TIME:')) {
      start = Date.parse(line.slice('#EXT-X-PROGRAM-DATE-TIME:'.length))
    } else if (line.startsWith('#EXT-X-KEY:')) {
      const key = parseTagAttributes(line.slice('#EXT-X-KEY:'.length))

      if (key.size !== 1 || key.get('METHOD') !== 'NONE') {
        throwReplayFormatError()
      }
    } else if (!line.startsWith('#')) {
      if (!duration) {
        throwReplayFormatError()
      }

      const segment = resolveUrl(line, url, 'segment')
      const transportStream = /\.ts$/i.test(new URL(segment).pathname)

      if (init ? transportStream : !transportStream) {
        throwReplayFormatError()
      }

      resolvedUrlLength += segment.length

      if (
        segments.length >= MAX_REPLAY_SEGMENTS
        || resolvedUrlLength > MAX_RESOLVED_SEGMENT_URL_LENGTH
      ) {
        throw new ReplayLimitError()
      }

      segments.push(segment)
      timeline.push({ start, duration })
      duration = 0
      start = Number.NaN
    } else if (
      !/^#EXT-X-(?:TARGETDURATION|MEDIA-SEQUENCE|DISCONTINUITY-SEQUENCE):\d+$/.test(
        line,
      )
      && line !== '#EXT-X-PLAYLIST-TYPE:VOD'
    ) {
      throwReplayFormatError()
    }
  }

  if (!segments.length || duration) {
    throwReplayFormatError()
  }

  const hasIndependentTimeline =
    !init
    && lines.includes('#EXT-X-INDEPENDENT-SEGMENTS')
    && timeline.every(
      ({ start }, index) =>
        Number.isFinite(start)
        && start > (timeline[index - 1]?.start ?? -Infinity),
    )

  return {
    ...(init ? { init } : {}),
    segments,
    ...(hasIndependentTimeline ? { transportTimeline: timeline } : {}),
  }
}

/**
 * Maps independently decodable backup segments onto the primary track.
 *
 * @param primary - Track whose playback sequence must be preserved.
 * @param backup - Candidate track from another rendition of the same replay.
 * @returns A backup URL at each matching primary index, if both timelines are known.
 */
export function alignReplayTransportSegments(
  primary: ReplayTrack,
  backup: ReplayTrack,
) {
  if (!primary.transportTimeline || !backup.transportTimeline) {
    return
  }

  const byStart = new Map(
    backup.transportTimeline.map(({ start, duration }, index) => [
      start,
      { duration, url: backup.segments[index] },
    ]),
  )

  return primary.transportTimeline.map(({ start, duration }) => {
    const candidate = byStart.get(start)

    return candidate?.duration === duration ? candidate.url : undefined
  })
}
