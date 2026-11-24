import { noop } from '@ntnyq/utils'
import { buildFilename } from '~/utils/download/filename'
import { ReplayStorageError } from '~/utils/replay/errors'
import {
  getReplayStorageBudget,
  isReplayQuotaError,
} from '~/utils/replay/storage'
import { assembleReplay } from './assembleReplay'
import { ReplayBusyError } from './replayErrors'
import { saveReplay } from './saveReplay'
import { stageReplay } from './stageReplay'
import type { DownloadPreferences } from '~/types/download'
import type { BroadcastReplay } from '~/utils/replay/broadcast'
import type {
  ReplayQualityPreference,
  ReplayRenditionRetry,
} from '~/utils/replay/playlist'
import type { ReplayFetchingProgress } from './stageReplay'

export {
  ReplayBusyError,
  ReplayCancelledError,
  ReplayFetchError,
  ReplaySaveError,
  ReplaySegmentError,
  ReplayStalledError,
} from './replayErrors'

/**
 * Lock name and OPFS directory shared by all replay task pages.
 */
const DIRECTORY = 'broadcast-replay'

/**
 * Progress reported to the replay task page.
 */
export type ReplayProgress =
  | { phase: 'validating' | 'assembling' | 'saving' }
  | ReplayFetchingProgress

/**
 * Reads the input size budget from the browser's origin storage estimate.
 *
 * @param staged - Whether the estimate already includes the staged media.
 * @returns The input size budget in bytes.
 * @throws {ReplayStorageError} When the estimate is unavailable or invalid.
 */
async function readStorageBudget(staged = false) {
  try {
    return getReplayStorageBudget(await navigator.storage.estimate(), staged)
  } catch (error) {
    throw new ReplayStorageError(undefined, { cause: error })
  }
}

/**
 * Removes the replay workspace while the caller holds the exclusive lock.
 *
 * @param root - The root of the origin private file system.
 * @throws When an existing replay workspace cannot be removed.
 */
async function removeTemporaryFiles(root: FileSystemDirectoryHandle) {
  try {
    await root.removeEntry(DIRECTORY, { recursive: true })
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== 'NotFoundError') {
      throw error
    }
  }
}

/**
 * Downloads a captured HLS replay, assembles an MP4, and saves it through the browser.
 * The exclusive lock protects the temporary files until the native download settles.
 *
 * @param replay - Validated replay metadata and captured playlist URL.
 * @param quality - Preferred playback quality for rendition selection.
 * @param preferences - Filename template and browser save prompt preferences.
 * @param signal - Signal used to cancel the task and its active operations.
 * @param onProgress - Callback for phase changes and media segment counts.
 * @param retry - Exact alternative rendition to try after a previous failure.
 * @returns A promise that resolves after the browser reports a completed download.
 * @throws {ReplayBusyError} When another replay task holds the lock.
 * @throws {ReplayStorageError} When temporary storage is unavailable or insufficient.
 * @throws When the task is aborted or a playlist, media, or save operation fails.
 */
export async function downloadReplay(
  replay: BroadcastReplay,
  quality: ReplayQualityPreference,
  preferences: DownloadPreferences,
  signal: AbortSignal,
  onProgress: (progress: ReplayProgress) => void,
  retry?: ReplayRenditionRetry,
) {
  return navigator.locks.request(
    DIRECTORY,
    { ifAvailable: true },
    async lock => {
      if (!lock) {
        throw new ReplayBusyError()
      }

      const root = await navigator.storage.getDirectory()

      // A previously closed or crashed task page may have left temporary files.
      await removeTemporaryFiles(root)

      try {
        const inputBudget = await readStorageBudget()

        if (!inputBudget) {
          throw new ReplayStorageError()
        }

        const directory = await root.getDirectoryHandle(DIRECTORY, {
          create: true,
        })

        onProgress({ phase: 'validating' })
        const { video, audio, audioRequired, variant, stagedBytes } =
          await stageReplay(replay.playlist, directory, {
            quality,
            inputBudget,
            signal,
            onProgress,
            retry,
          })

        const remainingBudget = await readStorageBudget(true)

        if (stagedBytes > remainingBudget) {
          throw new ReplayStorageError()
        }

        onProgress({ phase: 'assembling' })
        const result = await assembleReplay(video, audio, directory, signal, {
          audioRequired,
          retry: variant?.retry,
        })

        try {
          const filename = buildFilename(
            {
              postId: replay.post.broadcastId,
              mediaIndex: 1,
              author: replay.post.author,
              createdAt: replay.post.createdAt,
            },
            preferences.filenameTemplate,
            variant,
          )

          onProgress({ phase: 'saving' })
          await saveReplay(result.file, filename, preferences.saveAs, signal)
        } finally {
          await result.dispose().catch(noop)
        }
      } catch (error) {
        if (isReplayQuotaError(error)) {
          throw new ReplayStorageError(undefined, { cause: error })
        }

        throw error
      } finally {
        // Retry leftover cleanup when the next task starts.
        await removeTemporaryFiles(root).catch(noop)
      }
    },
  )
}
