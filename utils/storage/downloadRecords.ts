import { storage } from '#imports'
import type { DownloadRecord } from '../../types/download'

/**
 * Download queue and history records owned by this extension.
 */
export const downloadRecords = storage.defineItem<DownloadRecord[]>(
  'local:downloadRecords',
  { fallback: [] },
)
