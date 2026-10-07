import { normalizeDownloadRequest } from '../../utils/download'
import { buildFilename, normalizePreferences } from '../../utils/preferences'
import { isRecord } from '../../utils/video'
import type { DownloadRecord, DownloadStatus } from '../../types/download'
import type { DownloadRequest, DownloadResult } from '../../types/video'

const MAX_TERMINAL_RECORDS = 200
const MAX_OUTSTANDING_DOWNLOADS = 1000

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
  /**
   * Pauses a native transfer after ownership has been checked.
   */
  pause: (id: number) => Promise<void>
  /**
   * Resumes a paused native transfer after a concurrency slot is available.
   */
  resume: (id: number) => Promise<void>
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
 * Creates a durable queue with serialized mutations and extension-owned history.
 * Native download calls are serialized so save dialogs never overlap.
 *
 * @param ports - Persistence, preference, and native browser operations.
 * @returns Queue admission, management, reconciliation, and history operations.
 */
export function createDownloadManager(ports: DownloadManagerPorts) {
  let records: DownloadRecord[] | undefined
  let nextQueueId = -Date.now()
  let operations = Promise.resolve()

  /**
   * Serializes state changes, including events raised during native API calls.
   *
   * @param operation - Queue mutation or consistent read to perform.
   * @returns The result without letting a failure block subsequent operations.
   */
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = operations.then(operation)
    operations = result.then(() => {}).catch(() => {})
    return result
  }

  /**
   * Loads validated owned records and recovers interrupted native-start handoffs.
   * An ambiguous handoff requires explicit retry to prevent duplicate downloads.
   *
   * @returns Mutable records owned exclusively by the serialized controller.
   */
  async function load(): Promise<DownloadRecord[]> {
    if (records) {
      return records
    }
    const stored = await ports.readRecords()
    const seen = new Set<number>()
    records = Array.isArray(stored)
      ? stored.flatMap(value => {
          if (
            !isRecord(value)
            || typeof value['id'] !== 'number'
            || !Number.isSafeInteger(value['id'])
            || seen.has(value['id'])
            || typeof value['filename'] !== 'string'
          ) {
            return []
          }
          const request = normalizeDownloadRequest(value['request'])
          if (!request) {
            return []
          }
          const id = value['id']
          seen.add(id)
          nextQueueId = Math.min(nextQueueId, id - 1)
          const validStates: DownloadStatus['state'][] = [
            'queued',
            'paused',
            'in_progress',
            'complete',
            'cancelled',
            'interrupted',
            'missing',
          ]
          const state =
            validStates.find(state => state === value['state'])
            ?? (id >= 0 ? 'in_progress' : 'interrupted')
          const starting = value['starting'] === true
          return [
            {
              id,
              queueId:
                typeof value['queueId'] === 'number'
                && Number.isSafeInteger(value['queueId'])
                && value['queueId'] < 0
                  ? value['queueId']
                  : id < 0
                    ? id
                    : undefined,
              request,
              filename: value['filename'],
              state:
                id < 0 && (starting || state === 'in_progress')
                  ? 'interrupted'
                  : state,
              startedAt:
                typeof value['startedAt'] === 'number'
                && Number.isFinite(value['startedAt'])
                  ? value['startedAt']
                  : 0,
              saveAs: value['saveAs'] === true,
              bytesReceived:
                typeof value['bytesReceived'] === 'number'
                && Number.isFinite(value['bytesReceived'])
                  ? value['bytesReceived']
                  : 0,
              totalBytes:
                typeof value['totalBytes'] === 'number'
                && Number.isFinite(value['totalBytes'])
                  ? value['totalBytes']
                  : -1,
              error:
                starting && id < 0
                  ? 'START_INTERRUPTED'
                  : typeof value['error'] === 'string'
                    ? value['error']
                    : undefined,
              displayFilename:
                typeof value['displayFilename'] === 'string'
                  ? value['displayFilename'].split(/[\\/]/).at(-1)
                  : undefined,
            } satisfies DownloadRecord,
          ]
        })
      : []
    return records
  }

  /**
   * Persists an isolated snapshot, including every queued and paused task.
   *
   * @returns Completion of the storage write.
   */
  function persist() {
    return ports.writeRecords(structuredClone(records ?? []))
  }

  /**
   * Reconciles tracked native downloads without inspecting unrelated browser items.
   * Terminal snapshots remain history even after browser history is erased.
   *
   * @param id - Optional event ID; terminal records only need native reads when changed.
   * @returns Completion of native-state reconciliation.
   */
  async function reconcile(id?: number) {
    const owned = await load()
    for (const record of owned) {
      if (
        record.id < 0
        || (id === undefined ? !isActive(record) : record.id !== id)
      ) {
        continue
      }
      const [item] = await ports.search(record.id)
      if (!item) {
        if (isActive(record)) {
          record.state = 'missing'
        }
        continue
      }
      const state = getDownloadState(item)
      record.state =
        record.state === 'queued' && state === 'paused' ? 'queued' : state
      record.bytesReceived = item.bytesReceived
      record.totalBytes = item.totalBytes
      record.error = item.error
      record.displayFilename = item.filename?.split(/[\\/]/).at(-1) || undefined
    }
  }

  /**
   * Identifies transfers that must remain available for queue management.
   *
   * @param record - Tracked download or queue entry.
   * @returns Whether it is queued, transferring, or paused.
   */
  function isActive(record: DownloadRecord) {
    return ['queued', 'in_progress', 'paused'].includes(record.state ?? '')
  }

  /**
   * Bounds retained terminal history while preserving every manageable task.
   *
   * @returns Whether the record set changed.
   */
  function pruneHistory() {
    const owned = records ?? []
    const terminal = owned.filter(record => !isActive(record))
    if (terminal.length <= MAX_TERMINAL_RECORDS) {
      return false
    }
    const discarded = new Set(terminal.slice(0, -MAX_TERMINAL_RECORDS))
    records = owned.filter(record => !discarded.has(record))
    return true
  }

  /**
   * Fills available transfer slots from the persisted FIFO queue.
   * A persisted handoff marker prevents automatic duplication after worker termination.
   *
   * @returns Completion of currently eligible native starts.
   */
  async function drain() {
    const owned = await load()
    const preferences = normalizePreferences(await ports.readPreferences())
    let active = owned.filter(record => record.state === 'in_progress').length
    for (const record of owned) {
      if (active >= preferences.concurrency) {
        break
      }
      if (record.state !== 'queued') {
        continue
      }
      record.starting = true
      try {
        await persist()
      } catch (error) {
        record.starting = false
        console.warn('Could not persist download handoff', error)
        break
      }
      try {
        if (record.id >= 0) {
          await ports.resume(record.id)
        } else {
          record.id = await ports.download({
            url: record.request.url,
            filename: record.filename,
            conflictAction: 'uniquify',
            saveAs: record.saveAs ?? false,
          })
        }
        record.state = 'in_progress'
        record.error = undefined
        active++
      } catch (error) {
        record.state =
          record.id >= 0
            ? 'paused'
            : error instanceof Error && error.message === 'USER_CANCELED'
              ? 'cancelled'
              : 'interrupted'
        record.error = error instanceof Error ? error.message : 'downloadFailed'
      }
      record.starting = false
      try {
        await persist()
      } catch (error) {
        // The native side effect already happened: retain ownership in memory
        // and stop starting further tasks until persistence can succeed again.
        console.warn('Could not persist download state', error)
        break
      }
    }
    if (pruneHistory()) {
      try {
        await persist()
      } catch (error) {
        console.warn('Could not persist download history cleanup', error)
      }
    }
  }

  /**
   * Admits requests after active deduplication and completed-download checks.
   *
   * @param requests - Validated requests in FIFO order.
   * @param force - Whether the user explicitly confirmed another completed download.
   * @returns Ordered results paired with both post and media identifiers.
   */
  async function enqueue(requests: DownloadRequest[], force: boolean) {
    await reconcile()
    pruneHistory()
    const owned = await load()
    const preferences = normalizePreferences(await ports.readPreferences())
    const added = new Set<DownloadRecord>()
    let outstanding = owned.filter(isActive).length
    const entries = requests.map(request => {
      const matching = owned.filter(
        record =>
          record.request.postId === request.postId
          && record.request.mediaIndex === request.mediaIndex,
      )
      const active = matching.find(isActive)
      if (active) {
        return { request, record: active }
      }
      if (!force && matching.some(record => record.state === 'complete')) {
        return { request, error: 'duplicateDownload' }
      }
      if (outstanding >= MAX_OUTSTANDING_DOWNLOADS) {
        return { request, error: 'queueFull' }
      }
      const id = nextQueueId--
      const record: DownloadRecord = {
        id,
        queueId: id,
        request,
        filename: buildFilename(request, preferences.filenameTemplate),
        saveAs: preferences.saveAs,
        startedAt: Date.now(),
        state: 'queued',
        bytesReceived: 0,
        totalBytes: -1,
      }
      owned.push(record)
      added.add(record)
      outstanding++
      return { request, record }
    })
    try {
      await persist()
    } catch (error) {
      records = owned.filter(record => !added.has(record))
      throw error
    }
    await drain()
    return entries.map(({ request, record, error }) => ({
      postId: request.postId,
      mediaIndex: request.mediaIndex,
      result: (error
        ? { ok: false, error }
        : record && isActive(record)
          ? { ok: true, downloadId: record.id }
          : {
              ok: false,
              error: record?.error ?? 'downloadFailed',
            }) satisfies DownloadResult,
    }))
  }

  /**
   * Starts or queues one video with explicit completed-download confirmation.
   *
   * @param request - Validated MP4 request.
   * @param force - Whether another completed download was explicitly confirmed.
   * @returns The accepted queue/native ID or a structured admission failure.
   */
  function start(
    request: DownloadRequest,
    force = false,
  ): Promise<DownloadResult> {
    return serialize(async () => {
      try {
        return (
          (await enqueue([request], force))[0]?.result ?? {
            ok: false,
            error: 'downloadFailed',
          }
        )
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'downloadFailed',
        }
      }
    })
  }

  /**
   * Admits a cross-post batch atomically before starting eligible transfers.
   *
   * @param requests - Validated unique post and media pairs.
   * @param force - Whether completed items were explicitly selected for another download.
   * @returns Results in input order, including queued IDs and individual failures.
   */
  function batch(requests: DownloadRequest[], force = false) {
    return serialize(() => enqueue(requests, force))
  }

  /**
   * Lists searchable history and queue progress, optionally for a single post.
   *
   * @param postId - Optional post filter; omission lists every owned task.
   * @returns Newest-first statuses with retained author, post, and creation metadata.
   */
  function list(postId?: string): Promise<DownloadStatus[]> {
    return serialize(async () => {
      await reconcile()
      await persist()
      await drain()
      return (await load())
        .filter(record => !postId || record.request.postId === postId)
        .map(record => ({
          id: record.id,
          postId: record.request.postId,
          mediaIndex: record.request.mediaIndex,
          author: record.request.author,
          createdAt: record.request.createdAt,
          startedAt: record.startedAt ?? 0,
          filename: record.displayFilename || record.filename,
          state: record.state ?? 'missing',
          bytesReceived: record.bytesReceived ?? 0,
          totalBytes: record.totalBytes ?? -1,
          ...(record.error ? { error: record.error } : {}),
        }))
        .reverse()
    })
  }

  /**
   * Changes only owned tasks and applies native controls after state validation.
   *
   * @param id - Stable queue ID or accepted native download ID.
   * @param action - Pause, resume, cancellation, or explicit retry operation.
   * @returns The action outcome, with a new ID when retry creates another task.
   */
  function action(
    id: number,
    action: 'cancel' | 'pause' | 'resume' | 'retry',
  ): Promise<DownloadResult | { ok: true }> {
    return serialize(async () => {
      await reconcile()
      const record = (await load()).find(
        record => record.id === id || record.queueId === id,
      )
      if (!record) {
        return { ok: false, error: 'foreignDownload' }
      }
      if (action === 'retry') {
        if (isActive(record) || record.state === 'complete') {
          return { ok: false, error: 'retryUnavailable' }
        }
        return (
          (await enqueue([record.request], false))[0]?.result ?? {
            ok: false,
            error: 'downloadFailed',
          }
        )
      }
      if (!isActive(record)) {
        return { ok: false, error: 'finishedDownload' }
      }
      if (action === 'pause') {
        if (record.state === 'paused') {
          return { ok: true }
        }
        if (record.id >= 0 && record.state === 'in_progress') {
          await ports.pause(record.id)
        }
        record.state = 'paused'
      } else if (action === 'resume') {
        if (record.state !== 'paused') {
          return { ok: false, error: 'resumeUnavailable' }
        }
        record.state = 'queued'
      } else {
        if (record.id >= 0) {
          await ports.cancel(record.id)
        }
        record.state = 'cancelled'
        record.error = 'USER_CANCELED'
      }
      await persist()
      await drain()
      if (action === 'resume' && record.state === 'paused' && record.error) {
        return { ok: false, error: record.error }
      }
      return { ok: true }
    })
  }

  /**
   * Removes only terminal extension history without erasing browser files or history.
   *
   * @param ids - Optional selected record IDs; omission clears all terminal records.
   * @returns Number of removed records.
   */
  function clear(ids?: number[]) {
    return serialize(async () => {
      await reconcile()
      const owned = await load()
      const selected = ids ? new Set(ids) : undefined
      const retained = owned.filter(
        record =>
          isActive(record)
          || (selected
            && !selected.has(record.id)
            && (record.queueId === undefined || !selected.has(record.queueId))),
      )
      records = retained
      try {
        await persist()
      } catch (error) {
        records = owned
        throw error
      }
      return owned.length - retained.length
    })
  }

  /**
   * Recovers persisted tasks or advances the queue after owned native state changes.
   *
   * @param id - Optional native event ID; unrelated downloads are ignored.
   * @returns Completion of reconciliation, persistence, and queue dispatch.
   */
  function refresh(id?: number) {
    return serialize(async () => {
      const owned = await load()
      if (id !== undefined && !owned.some(record => record.id === id)) {
        return
      }
      await reconcile(id)
      await persist()
      await drain()
    })
  }

  return { start, list, action, batch, clear, refresh }
}
