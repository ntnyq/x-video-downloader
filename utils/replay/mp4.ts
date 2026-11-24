import { ReplayFormatError } from './errors'

/**
 * An ISO base media file format box and the bounds of its payload.
 */
interface Box {
  /**
   * Four-character identifier from the box header.
   */
  type: string
  /**
   * Inclusive byte offset of the payload within the data view.
   */
  start: number
  /**
   * Exclusive end offset of the box within the data view.
   */
  end: number
}

function readBox(data: DataView, start: number, end: number): Box {
  if (end - start < 8 || data.byteLength - start < 8) {
    throw new ReplayFormatError()
  }

  const type = String.fromCodePoint(
    ...new Uint8Array(data.buffer, data.byteOffset + start + 4, 4),
  )
  let size = data.getUint32(start)
  let header = 8

  if (size === 1) {
    if (end - start < 16 || data.byteLength - start < 16) {
      throw new ReplayFormatError()
    }

    size = Number(data.getBigUint64(start + 8))
    header = 16
  } else if (size === 0) {
    size = end - start
  }

  if (size < header || size > end - start) {
    throw new ReplayFormatError()
  }

  return {
    type,
    start: start + header,
    end: start + size,
  }
}

/**
 * Reads box boundaries without copying media payloads.
 *
 * @param data - View over the source media bytes.
 * @param start - Inclusive offset of the first box header to read.
 * @param end - Exclusive end offset of the containing region.
 * @returns Box types and payload bounds in file order.
 * @throws {ReplayFormatError} When a box is malformed or the region contains too many boxes.
 */
function readBoxes(data: DataView, start: number, end: number): Box[] {
  const result: Box[] = []

  while (start < end) {
    if (result.length >= 2048) {
      throw new ReplayFormatError()
    }

    const box = readBox(data, start, end)

    result.push(box)
    start = box.end
  }

  return result
}

/**
 * Reads the immediate children within a container box's payload.
 *
 * @param data - View over the original media bytes.
 * @param box - Parent box with payload bounds in the view.
 * @returns Child boxes in file order.
 * @throws {ReplayFormatError} When the container has malformed child boxes.
 */
function readChildBoxes(data: DataView, box: Box) {
  return readBoxes(data, box.start, box.end)
}

/**
 * Finds the first immediate child of the required box type.
 *
 * @param data - View over the original media bytes.
 * @param box - Parent box to search.
 * @param type - Required four-character box identifier.
 * @returns The first matching child box.
 * @throws {ReplayFormatError} When the required child is missing or the child boxes are malformed.
 */
function requireChildBox(data: DataView, box: Box, type: string): Box {
  const item = readChildBoxes(data, box).find(entry => entry.type === type)

  if (!item) {
    throw new ReplayFormatError()
  }

  return item
}

/**
 * Rejects alternate codecs, encrypted sample entries, and incomplete track layouts.
 *
 * @param bytes - Fragmented MP4 initialization segment bytes.
 * @param track - Whether the playlist carries video or a separate audio rendition.
 * @param audioRequired - Whether the video initialization segment must also contain an audio track.
 * @throws {ReplayFormatError} When the boxes, codecs, or track layout are unsupported.
 */
export function validateReplayMp4InitSegment(
  bytes: Uint8Array,
  track: 'video' | 'audio',
  audioRequired: boolean,
) {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const root = readBoxes(data, 0, data.byteLength)
  const moov = root.find(box => box.type === 'moov')

  if (!moov || root.some(box => ['moof', 'mdat', 'pssh'].includes(box.type))) {
    throw new ReplayFormatError()
  }

  const records = readChildBoxes(data, moov)

  if (
    !records.some(box => box.type === 'mvex')
    || records.some(box => box.type === 'pssh')
  ) {
    throw new ReplayFormatError()
  }

  let video = 0
  let audio = 0

  for (const trak of records) {
    if (trak.type !== 'trak') {
      continue
    }

    const mdia = requireChildBox(data, trak, 'mdia')
    const minf = requireChildBox(data, mdia, 'minf')
    const stbl = requireChildBox(data, minf, 'stbl')
    const stsd = requireChildBox(data, stbl, 'stsd')

    if (stsd.end - stsd.start < 8 || data.getUint32(stsd.start + 4) !== 1) {
      throw new ReplayFormatError()
    }

    const entries = readBoxes(data, stsd.start + 8, stsd.end)
    const codec = entries.length === 1 ? entries[0]?.type : undefined

    if (codec === 'avc1' || codec === 'avc3') {
      video++
    } else if (codec === 'mp4a') {
      audio++
    } else {
      throw new ReplayFormatError()
    }
  }

  if (
    track === 'audio'
      ? audio !== 1 || video !== 0
      : video !== 1 || audio > 1 || (audioRequired && audio !== 1)
  ) {
    throw new ReplayFormatError()
  }
}

/**
 * Verifies the required tracks in the remuxer's output without reading media payloads.
 * @param file - The generated fMP4, with its movie box following the file type box.
 * @param audioRequired - Whether the output must contain AAC as well as H.264.
 */
export async function validateReplayMp4Output(
  file: Blob,
  audioRequired: boolean,
) {
  const header = new DataView(await file.slice(0, 16).arrayBuffer())
  const ftyp = readBox(header, 0, file.size)
  const movieHeader = new DataView(
    await file.slice(ftyp.end, ftyp.end + 16).arrayBuffer(),
  )
  const movie = readBox(movieHeader, 0, file.size - ftyp.end)

  if (ftyp.type !== 'ftyp' || movie.type !== 'moov') {
    throw new ReplayFormatError()
  }

  const init = await file.slice(ftyp.end, ftyp.end + movie.end).arrayBuffer()

  validateReplayMp4InitSegment(new Uint8Array(init), 'video', audioRequired)
}

/**
 * Checks that a replay segment contains fragmented MP4 media and clear track fragments.
 *
 * @param bytes - Media segment bytes from the selected replay playlist.
 * @throws {ReplayFormatError} When required boxes are missing, malformed, or signal encryption.
 */
export function validateReplayMp4Segment(bytes: Uint8Array) {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const root = readBoxes(data, 0, bytes.byteLength)
  const fragments = root.filter(box => box.type === 'moof')

  if (
    !fragments.length
    || !root.some(box => box.type === 'mdat')
    || root.some(box => box.type === 'moov' || box.type === 'pssh')
  ) {
    throw new ReplayFormatError()
  }

  for (const fragment of fragments) {
    const tracks = readChildBoxes(data, fragment).filter(
      box => box.type === 'traf',
    )

    if (
      !tracks.length
      || tracks.some(traf =>
        readChildBoxes(data, traf).some(box =>
          ['senc', 'saio', 'saiz'].includes(box.type),
        ),
      )
    ) {
      throw new ReplayFormatError()
    }
  }
}
