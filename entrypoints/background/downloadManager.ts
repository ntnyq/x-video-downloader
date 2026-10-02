import { mapAsync } from '@ntnyq/utils'
import { normalizeDownloadRequest } from '../../utils/download'
import { buildFilename, normalizePreferences } from '../../utils/preferences'
import { isRecord } from '../../utils/video'
import type { DownloadRecord, DownloadStatus } from '../../types/download'
import type { DownloadRequest, DownloadResult } from '../../types/video'

interface NativeDownload {
  /**
   * Browser download identifier returned by the native downloads API.
   */
  id: number
  /**
   * Native transfer state before paused and cancelled states are derived.
   */
  state: 'in_progress' | 'complete' | 'interrupted'
  /**
   * Number of bytes received by the browser so far.
   */
  bytesReceived: number
  /**
   * Expected byte count from the browser; negative values mean unknown.
   */
  totalBytes: number
  /**
   * Native filename, which may include a full path or a user-selected name.
   */
  filename?: string
  /**
   * Whether an otherwise active native transfer is paused.
   */
  paused?: boolean
  /**
   * Native interruption code, including USER_CANCELED for user cancellation.
   */
  error?: string
}

interface DownloadManagerPorts {
  /**
   * Reads persisted records for downloads owned by this extension.
   *
   * @returns The unvalidated stored value for normalization by the manager.
   * @throws When reading storage fails.
   */
  readRecords: () => Promise<unknown>
  /**
   * Replaces the persisted set of extension-owned download records.
   *
   * @param records - Complete snapshot of records to persist.
   * @returns A promise resolving when storage has accepted the snapshot.
   * @throws When writing storage fails.
   */
  writeRecords: (records: DownloadRecord[]) => Promise<void>
  /**
   * Reads the download settings used when a new transfer starts.
   *
   * @returns Unvalidated preferences for normalization by the manager.
   * @throws When reading preferences fails.
   */
  readPreferences: () => Promise<unknown>
  /**
   * Starts a native browser download using the supplied save options.
   *
   * @param options - Validated media URL, filename, conflict policy, and save-dialog setting.
   * @param options.url - Validated HTTPS MP4 URL hosted on video.twimg.com.
   * @param options.filename - Safe MP4 basename requested for the download.
   * @param options.conflictAction - Policy that keeps existing files by choosing a unique name.
   * @param options.saveAs - Whether the browser should prompt for a save location.
   * @returns The browser identifier of the accepted download.
   * @throws When the browser rejects the download or the save dialog is cancelled.
   */
  download: (options: {
    /**
     * Validated HTTPS MP4 URL on video.twimg.com to download.
     */
    url: string
    /**
     * Safe MP4 basename requested for the new download.
     */
    filename: string
    /**
     * Requests a unique filename instead of overwriting an existing file.
     */
    conflictAction: 'uniquify'
    /**
     * Whether the browser should prompt for a save location.
     */
    saveAs: boolean
  }) => Promise<number>
  /**
   * Looks up a native browser download by its identifier.
   *
   * @param id - Browser download identifier to search for.
   * @returns Matching native records, or an empty array if the record was erased.
   * @throws When the browser search fails.
   */
  search: (id: number) => Promise<NativeDownload[]>
  /**
   * Requests cancellation of a native browser download.
   *
   * @param id - Browser download identifier to cancel.
   * @returns A promise resolving when the cancellation request is accepted.
   * @throws When the browser rejects the cancellation.
   */
  cancel: (id: number) => Promise<void>
}

/**
 * Maps a native record to the UI state, including missing, paused, and cancelled cases.
 *
 * @param item - Native record, or undefined if the browser no longer retains it.
 * @returns The normalized download state used by the extension UI.
 */
function getDownloadState(item?: NativeDownload): DownloadStatus['state'] {
  if (!item) {
    return 'missing'
  }
  if (item.state === 'interrupted' && item.error === 'USER_CANCELED') {
    return 'cancelled'
  }
  if (item.state === 'in_progress' && item.paused) {
    return 'paused'
  }
  return item.state
}

/**
 * Creates an extension-owned download controller with serialized persistence.
 * Requests are deduplicated while starting and while the matching transfer remains active.
 *
 * @param ports - Storage and browser operations supplied by the background environment.
 * @returns Operations for starting, listing, cancelling, retrying, and batching downloads.
 */
export function createDownloadManager(ports: DownloadManagerPorts) {
  let records: DownloadRecord[] | undefined
  let loading: Promise<void> | undefined
  let persistence = Promise.resolve()
  const pending = new Map<string, Promise<DownloadResult>>()

  /**
   * Lazily reads and validates owned records, sharing concurrent initialization.
   * A failed read clears the loading promise so the next call can retry.
   *
   * @returns The current in-memory records after successful initialization.
   * @throws When reading persisted records fails.
   */
  async function load() {
    loading ??= (async () => {
      const stored = await ports.readRecords()
      records = Array.isArray(stored)
        ? stored.flatMap(value => {
            if (
              !isRecord(value)
              || !Number.isInteger(value['id'])
              || typeof value['id'] !== 'number'
              || typeof value['filename'] !== 'string'
            ) {
              return []
            }
            const request = normalizeDownloadRequest(value['request'])
            return request
              ? [{ id: value['id'], filename: value['filename'], request }]
              : []
          })
        : []
    })().catch(error => {
      loading = undefined
      throw error
    })
    await loading
    return records ?? []
  }

  /**
   * Queues a snapshot write without allowing an earlier failure to block later writes.
   *
   * @returns A promise resolving when this snapshot has been persisted.
   * @throws When this snapshot cannot be written to storage.
   */
  function persist() {
    const snapshot = [...(records ?? [])]
    const write = persistence.then(() => ports.writeRecords(snapshot))
    persistence = write.catch(() => {})
    return write
  }

  /**
   * Prunes old terminal or missing records once more than 200 downloads are tracked.
   * Active transfers and the newest 100 records remain available for management.
   *
   * @returns A promise resolving after any required cleanup and persistence.
   * @throws When records cannot be read, native state cannot be queried, or cleanup cannot be saved.
   */
  async function prune() {
    const owned = await load()
    if (owned.length <= 200) {
      return
    }
    const oldest = owned.slice(0, -100)
    const removed = new Set<number>()
    await Promise.all(
      oldest.map(async record => {
        const [item] = await ports.search(record.id)
        if (item?.state !== 'in_progress') {
          removed.add(record.id)
        }
      }),
    )
    records = (records ?? []).filter(record => !removed.has(record.id))
    await persist()
  }

  /**
   * Starts or reuses a matching transfer using the current filename and save-dialog settings.
   * Persistence failures after a successful start do not turn the download into a failed result.
   *
   * @param request - Validated single-video request accepted by the message boundary.
   * @returns A success result with the browser download ID, or a structured start failure.
   */
  async function start(request: DownloadRequest): Promise<DownloadResult> {
    const key = `${request.postId}:${request.mediaIndex}:${request.url}`
    const existing = pending.get(key)
    if (existing) {
      return existing
    }
    const task = (async (): Promise<DownloadResult> => {
      try {
        const owned = await load()
        const previous = [...owned]
          .reverse()
          .find(
            record =>
              record.request.postId === request.postId
              && record.request.mediaIndex === request.mediaIndex
              && record.request.url === request.url,
          )
        if (previous) {
          const [item] = await ports.search(previous.id)
          if (item?.state === 'in_progress') {
            return { ok: true, downloadId: previous.id }
          }
        }
        const preferences = normalizePreferences(await ports.readPreferences())
        const filename = buildFilename(request, preferences.filenameTemplate)
        const id = await ports.download({
          url: request.url,
          filename,
          conflictAction: 'uniquify',
          saveAs: preferences.saveAs,
        })
        records = [...(records ?? []), { id, request, filename }]
        // Keep all active transfers; older terminal entries are pruned on query.
        try {
          await persist()
          await prune()
        } catch {
          // The download has started. Preserve its in-memory tracking and never
          // report it as a failed start, which could create duplicate downloads.
        }
        return { ok: true, downloadId: id }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'downloadFailed',
        }
      }
    })()
    pending.set(key, task)
    try {
      return await task
    } finally {
      pending.delete(key)
    }
  }

  /**
   * Reads a post's native progress and retains at most ten terminal records for that post.
   * Active and paused downloads remain manageable; filenames are reduced to basenames.
   *
   * @param postId - Identifier of the post whose owned downloads should be listed.
   * @returns Download statuses in newest-first order.
   * @throws When storage, browser lookup, or record cleanup fails.
   */
  async function list(postId: string): Promise<DownloadStatus[]> {
    const owned = (await load()).filter(
      record => record.request.postId === postId,
    )
    const statuses = await Promise.all(
      owned.map(async record => {
        const [item] = await ports.search(record.id)
        const state = getDownloadState(item)
        return {
          id: record.id,
          postId,
          mediaIndex: record.request.mediaIndex,
          filename: item?.filename?.split(/[\\/]/).at(-1) || record.filename,
          state,
          bytesReceived: item?.bytesReceived ?? 0,
          totalBytes: item?.totalBytes ?? -1,
          ...(item?.error ? { error: item.error } : {}),
        }
      }),
    )
    // Only discard old terminal tasks. Active downloads remain manageable.
    const terminal = statuses.filter(
      status => status.state !== 'in_progress' && status.state !== 'paused',
    )
    const discard = new Set(
      terminal
        .slice(0, Math.max(0, terminal.length - 10))
        .map(status => status.id),
    )
    if (discard.size) {
      records = (records ?? []).filter(record => !discard.has(record.id))
      await persist()
    }
    return statuses.filter(status => !discard.has(status.id)).reverse()
  }

  /**
   * Cancels an owned active transfer or retries an owned failed or missing transfer.
   *
   * @param id - Browser download identifier belonging to this extension.
   * @param action - Cancellation or retry operation requested by the UI.
   * @returns A success result or a structured ownership, state, or retry failure.
   * @throws When loading records, querying native state, or cancelling fails.
   */
  async function action(
    id: number,
    action: 'cancel' | 'retry',
  ): Promise<
    | DownloadResult
    | {
        /**
         * Indicates that cancellation of an owned active download was accepted.
         */
        ok: true
      }
  > {
    const record = (await load()).find(item => item.id === id)
    if (!record) {
      return { ok: false, error: 'foreignDownload' }
    }
    const [item] = await ports.search(id)
    if (action === 'cancel') {
      if (item?.state !== 'in_progress') {
        return { ok: false, error: 'finishedDownload' }
      }
      await ports.cancel(id)
      return { ok: true }
    }
    if (item?.state === 'in_progress' || item?.state === 'complete') {
      return { ok: false, error: 'retryUnavailable' }
    }
    return start(record.request)
  }

  /**
   * Starts requests sequentially so save dialogs do not overlap.
   * Each start failure is retained in the results without stopping the remaining requests.
   *
   * @param requests - Validated single-post batch in the desired save-dialog order.
   * @returns Results in request order, each paired with its one-based media position.
   */
  async function batch(requests: DownloadRequest[]) {
    // Serialize save dialogs, but downloads themselves may transfer concurrently.
    return mapAsync(
      requests,
      async request => ({
        mediaIndex: request.mediaIndex,
        result: await start(request),
      }),
      { concurrency: 1 },
    )
  }

  return { start, list, action, batch }
}
