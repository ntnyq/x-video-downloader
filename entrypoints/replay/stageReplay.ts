import { noop } from '@ntnyq/utils'
import {
  ReplayFormatError,
  ReplayLimitError,
  ReplayStorageError,
  ReplayUnfinishedError,
} from '~/utils/replay/errors'
import {
  validateReplayMp4InitSegment,
  validateReplayMp4Segment,
} from '~/utils/replay/mp4'
import {
  alignReplayTransportSegments,
  MAX_REPLAY_SEGMENTS,
  parseReplayTrack,
  selectReplayVariant,
} from '~/utils/replay/playlist'
import { validateReplayTransportSegment } from '~/utils/replay/transport'
import { fetchReplayPlaylist, fetchReplayResource } from './fetchReplay'
import { ReplayFetchError, ReplaySegmentError } from './replayErrors'
import type { RemuxInput } from 'media-remux'
import type {
  ReplayQualityPreference,
  ReplayRendition,
  ReplayRenditionRetry,
  ReplayTrack,
} from '~/utils/replay/playlist'

/**
 * Segment download progress for the selected rendition.
 */
export interface ReplayFetchingProgress {
  phase: 'fetching'
  /**
   * Number of media segments written to temporary storage.
   */
  completed: number
  /**
   * Combined number of video and separate audio media segments.
   */
  total: number
  /**
   * Selected rendition, when the source is a master playlist.
   */
  rendition?: ReplayRendition
}

/**
 * Resolves replay tracks and stages validated media in the task's OPFS workspace.
 *
 * @param playlistUrl - Validated master or media playlist URL.
 * @param directory - Temporary directory owned by the replay task.
 * @param options - Track selection, storage, cancellation, and reporting settings.
 * @param options.quality - Preferred quality for rendition selection.
 * @param options.inputBudget - Maximum combined size of the staged tracks in bytes.
 * @param options.signal - Signal used to cancel fetching and staging.
 * @param options.onProgress - Callback invoked before staging and after each media segment.
 * @param options.retry - Alternative rendition to select after a previous failure.
 * @returns Staged tracks, selected rendition, audio requirement, and total staged bytes.
 * @throws {ReplayLimitError} When a resource or the combined segment count exceeds its limit.
 * @throws {ReplaySegmentError} When a media segment fails format validation.
 * @throws {ReplayStorageError} When the staged input would exceed the storage budget.
 */
export async function stageReplay(
  playlistUrl: string,
  directory: FileSystemDirectoryHandle,
  {
    quality,
    inputBudget,
    signal,
    onProgress,
    retry,
  }: {
    quality: ReplayQualityPreference
    inputBudget: number
    signal: AbortSignal
    onProgress: (progress: ReplayFetchingProgress) => void
    retry?: ReplayRenditionRetry
  },
) {
  const master = await fetchReplayPlaylist(playlistUrl, signal)
  const variant = selectReplayVariant(master, playlistUrl, quality, retry)
  const videoTrack = variant
    ? parseReplayTrack(
        await fetchReplayPlaylist(variant.videoUrl, signal),
        variant.videoUrl,
      )
    : parseReplayTrack(master, playlistUrl)
  const audioTrack = variant?.audioUrl
    ? parseReplayTrack(
        await fetchReplayPlaylist(variant.audioUrl, signal),
        variant.audioUrl,
      )
    : undefined
  const audioRequired = Boolean(audioTrack || variant?.audioRequired)
  const backupPlaylists = variant?.segmentPlaylistUrls ?? []
  const backups = new Map<
    string,
    ReturnType<typeof alignReplayTransportSegments>
  >()
  const total = videoTrack.segments.length + (audioTrack?.segments.length ?? 0)

  if (total > MAX_REPLAY_SEGMENTS) {
    throw new ReplayLimitError()
  }

  let completed = 0
  let stagedBytes = 0

  const reportFetching = () =>
    onProgress({
      phase: 'fetching',
      completed,
      total,
      rendition: variant,
    })

  reportFetching()

  /**
   * Fetches the first usable MPEG-TS segment at the same playback time.
   *
   * @param index - Zero-based index of the segment in the primary video track.
   * @returns Validated bytes and the source playlist, if an aligned backup can be fetched.
   */
  async function fetchBackupSegment(index: number) {
    for (const playlist of backupPlaylists) {
      try {
        if (!backups.has(playlist)) {
          // Remember rejected playlists as well so later segments skip them.
          backups.set(playlist, undefined)
          const backup = parseReplayTrack(
            await fetchReplayPlaylist(playlist, signal),
            playlist,
          )

          backups.set(
            playlist,
            alignReplayTransportSegments(videoTrack, backup),
          )
        }

        const url = backups.get(playlist)?.[index]

        if (url && url !== videoTrack.segments[index]) {
          const bytes = await fetchReplayResource(
            url,
            signal,
            validateReplayTransportSegment,
            false,
          )

          return {
            bytes,
            playlist,
          }
        }
      } catch (error) {
        if (
          !(error instanceof ReplayFetchError)
          && !(error instanceof ReplayFormatError)
          && !(error instanceof ReplayUnfinishedError)
          && !(error instanceof ReplayLimitError)
        ) {
          throw error
        }
      }
    }
  }

  /**
   * Writes one track in playlist order and records the MPEG-TS boundaries for the Worker.
   *
   * @param track - Validated initialization and media segment URLs.
   * @param kind - Determines the temporary filename and track validation rules.
   * @returns The staged file with segment offsets and rendition switches for MPEG-TS.
   */
  async function writeTrack(
    track: ReplayTrack,
    kind: 'video' | 'audio',
  ): Promise<RemuxInput> {
    const extension = track.init ? 'mp4' : 'ts'
    const handle = await directory.getFileHandle(`${kind}.${extension}`, {
      create: true,
    })
    const writer = await handle.createWritable()
    const trackStart = stagedBytes
    const segmentOffsets: number[] | undefined = track.init ? undefined : []
    const validateSegment = track.init
      ? validateReplayMp4Segment
      : validateReplayTransportSegment
    const allowBackup =
      kind === 'video'
      && track.transportTimeline !== undefined
      && backupPlaylists.length > 0
    const renditionSwitches: number[] = []
    let previousPlaylist = variant?.videoUrl

    /**
     * Appends bytes and updates the shared storage budget after the write succeeds.
     *
     * @param bytes - Validated initialization or media segment bytes.
     * @throws {ReplayStorageError} When the write would exceed the input budget.
     */
    async function write(bytes: Uint8Array<ArrayBuffer>) {
      if (bytes.byteLength > inputBudget - stagedBytes) {
        throw new ReplayStorageError()
      }

      signal.throwIfAborted()
      await writer.write(bytes)
      stagedBytes += bytes.byteLength
    }

    try {
      if (track.init) {
        const bytes = await fetchReplayResource(track.init, signal, bytes =>
          validateReplayMp4InitSegment(
            bytes,
            kind,
            !audioTrack && audioRequired,
          ),
        )

        await write(bytes)
      }

      for (const [index, url] of track.segments.entries()) {
        try {
          let playlist = variant?.videoUrl
          let bytes: Uint8Array<ArrayBuffer>

          try {
            bytes = await fetchReplayResource(
              url,
              signal,
              validateSegment,
              !allowBackup,
            )
          } catch (error) {
            if (
              !allowBackup
              || (!(error instanceof ReplayFormatError)
                && !(error instanceof ReplayFetchError))
            ) {
              throw error
            }

            const backup = await fetchBackupSegment(index)

            if (backup) {
              bytes = backup.bytes
              playlist = backup.playlist
            } else if (error instanceof ReplayFormatError) {
              // Preserve the normal retry for a transient malformed response.
              bytes = await fetchReplayResource(
                url,
                signal,
                validateSegment,
                false,
              )
            } else {
              throw error
            }
          }

          if (index > 0 && previousPlaylist !== playlist) {
            renditionSwitches.push(index)
          }

          segmentOffsets?.push(stagedBytes - trackStart)

          await write(bytes)
          previousPlaylist = playlist
        } catch (error) {
          if (error instanceof ReplayFormatError) {
            throw new ReplaySegmentError(index + 1, variant?.retry, {
              cause: error,
            })
          }

          throw error
        }

        completed++
        reportFetching()
      }

      await writer.close()

      const blob = await handle.getFile()

      return segmentOffsets
        ? {
            blob,
            segmentOffsets,
            allowContinuityCounterReset: true,
            ...(renditionSwitches.length ? { renditionSwitches } : {}),
          }
        : blob
    } catch (error) {
      await writer.abort().catch(noop)

      throw error
    }
  }

  const video = await writeTrack(videoTrack, 'video')
  const audio = audioTrack ? await writeTrack(audioTrack, 'audio') : undefined

  return {
    video,
    audio,
    audioRequired,
    variant,
    stagedBytes,
  }
}
