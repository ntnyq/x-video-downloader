import { noop } from '@ntnyq/utils'
import { isRemuxError, runMediaJob } from 'media-remux'
import { ReplayFormatError } from '~/utils/replay/errors'
import { validateReplayMp4Output } from '~/utils/replay/mp4'
import { startIdleTimeout } from './idleTimeout'
import { ReplaySegmentError, ReplayStalledError } from './replayErrors'
import type { RemuxInput } from 'media-remux'
import type { ReplayRenditionRetry } from '~/utils/replay/playlist'

/**
 * Maximum idle time in milliseconds while assembling a replay.
 * The timer resets whenever the Worker reports progress.
 */
const REMUX_IDLE_TIMEOUT = 15 * 60_000

/**
 * Assembles the staged tracks in a Worker and validates the resulting MP4.
 *
 * @param video - Staged video input, which may also contain audio.
 * @param audio - Staged input for a separate audio rendition, if present.
 * @param directory - OPFS workspace for the Worker output.
 * @param signal - Signal used to cancel assembly.
 * @param options - Output validation and rendition retry settings.
 * @param options.audioRequired - Whether the MP4 must contain an audio track.
 * @param options.retry - Alternative rendition to attach to MPEG-TS processing errors.
 * @returns The validated Worker result, which the caller must dispose after saving.
 * @throws {ReplayStalledError} When the Worker stops reporting progress.
 * @throws {ReplaySegmentError} When an MPEG-TS input cannot be processed.
 */
export async function assembleReplay(
  video: RemuxInput,
  audio: RemuxInput | undefined,
  directory: FileSystemDirectoryHandle,
  signal: AbortSignal,
  {
    audioRequired,
    retry,
  }: { audioRequired: boolean; retry?: ReplayRenditionRetry },
) {
  const videoIsTs = !(video instanceof Blob)
  const audioIsTs = audio !== undefined && !(audio instanceof Blob)
  const timeout = startIdleTimeout(
    signal,
    REMUX_IDLE_TIMEOUT,
    new ReplayStalledError(),
  )

  try {
    const result = await runMediaJob(
      audio
        ? {
            operation: 'combine',
            video,
            audio,
            // Mixed containers can use different timestamp origins.
            timeline: videoIsTs === audioIsTs ? undefined : 'align-starts',
          }
        : {
            operation: 'remux',
            input: video,
            tracks: 'video-with-optional-audio',
          },
      {
        createWorker() {
          return new Worker(new URL('./remux.worker.ts', import.meta.url), {
            type: 'module',
          })
        },
        directory,
        signal: timeout.signal,
        onProgress: timeout.reset,
      },
    )

    try {
      if (result.mimeType !== 'video/mp4' || !result.file.size) {
        throw new ReplayFormatError()
      }

      await validateReplayMp4Output(result.file, audioRequired)
      timeout.signal.throwIfAborted()

      return result
    } catch (error) {
      await result.dispose().catch(noop)

      throw error
    }
  } catch (error) {
    timeout.signal.throwIfAborted()

    if (
      (videoIsTs || audioIsTs)
      && (isRemuxError(error) || error instanceof ReplayFormatError)
    ) {
      // The Worker reports a zero-based segment index in TS packet errors.
      const index = error.message.match(
        /\(segment (\d+), PID \d+, byte offset \d+\)/,
      )?.[1]

      throw new ReplaySegmentError(
        index === undefined ? undefined : Number(index) + 1,
        retry,
        { cause: error },
      )
    }

    throw error
  } finally {
    timeout.dispose()
  }
}
