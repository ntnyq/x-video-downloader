import { mapAsync } from '@ntnyq/utils'
import { normalizeDownloadRequest } from '../../utils/download'
import { buildFilename, normalizePreferences } from '../../utils/preferences'
import { isRecord } from '../../utils/video'
import type { DownloadRecord, DownloadStatus } from '../../types/download'
import type { DownloadRequest, DownloadResult } from '../../types/video'

interface NativeDownload {
  id: number
  state: 'in_progress' | 'complete' | 'interrupted'
  bytesReceived: number
  totalBytes: number
  filename?: string
  paused?: boolean
  error?: string
}

interface DownloadManagerPorts {
  readRecords: () => Promise<unknown>
  writeRecords: (records: DownloadRecord[]) => Promise<void>
  readPreferences: () => Promise<unknown>
  download: (options: {
    url: string
    filename: string
    conflictAction: 'uniquify'
    saveAs: boolean
  }) => Promise<number>
  search: (id: number) => Promise<NativeDownload[]>
  cancel: (id: number) => Promise<void>
}

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

export function createDownloadManager(ports: DownloadManagerPorts) {
  let records: DownloadRecord[] | undefined
  let loading: Promise<void> | undefined
  let persistence = Promise.resolve()
  const pending = new Map<string, Promise<DownloadResult>>()

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

  function persist() {
    const snapshot = [...(records ?? [])]
    const write = persistence.then(() => ports.writeRecords(snapshot))
    persistence = write.catch(() => {})
    return write
  }

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

  async function action(
    id: number,
    action: 'cancel' | 'retry',
  ): Promise<DownloadResult | { ok: true }> {
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
