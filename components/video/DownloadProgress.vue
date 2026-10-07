<script lang="ts" setup>
import { isTerminalDownload } from '~/utils/downloadHistory'
import { formatBytes } from '~/utils/preferences'
import type { DownloadStatus } from '~/types/download'

interface Props {
  /**
   * Owned downloads whose status and available actions are displayed.
   */
  downloads: DownloadStatus[]
  /**
   * Whether download actions are temporarily unavailable.
   */
  disabled: boolean
  /**
   * Displays source post and author for mixed-post lists.
   */
  showPost?: boolean
  /**
   * Offers removal of terminal records from extension history.
   */
  canRemove?: boolean
}
defineProps<Props>()
const emit = defineEmits<{
  /**
   * Requests cancellation or retry with the download ID and originating click.
   */
  action: [
    id: number,
    action: 'cancel' | 'retry' | 'pause' | 'resume',
    event: MouseEvent,
  ]
  /**
   * Removes one terminal history record without deleting its file.
   */
  remove: [id: number, event: MouseEvent]
}>()

const STATE_LABELS: Record<DownloadStatus['state'], string> = {
  queued: i18n.t('stateQueued'),
  in_progress: i18n.t('stateDownloading'),
  paused: i18n.t('statePaused'),
  complete: i18n.t('stateComplete'),
  interrupted: i18n.t('stateInterrupted'),
  cancelled: i18n.t('stateCancelled'),
  missing: i18n.t('stateMissing'),
}

/**
 * Calculates whole-number download progress when the total size is known.
 *
 * @param item - Current browser download status.
 * @returns The completion percentage capped at 100, or undefined for an unknown total.
 */
function percentage(item: DownloadStatus) {
  if (item.totalBytes <= 0) {
    return undefined
  }
  return Math.min(100, Math.floor((item.bytesReceived / item.totalBytes) * 100))
}
</script>

<template>
  <section
    v-if="downloads.length"
    :aria-label="i18n.t('downloadProgress')"
    class="mt-5 border-t border-line pt-4 space-y-4"
  >
    <h3 class="text-sm font-semibold">{{ i18n.t('downloadProgress') }}</h3>
    <div
      v-for="item in downloads"
      :key="item.id"
      class="space-y-2"
    >
      <a
        v-if="showPost"
        :href="`https://x.com/i/status/${item.postId}`"
        target="_blank"
        rel="noreferrer"
        class="block break-all text-xs text-muted xvd-focus hover:text-ink"
        >{{ item.author ? `@${item.author}` : i18n.t('post') }} ·
        {{ item.postId }}</a
      >
      <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span
          >{{ i18n.t('videoNumber', [item.mediaIndex]) }} ·
          {{ STATE_LABELS[item.state] }}</span
        >
        <div class="flex flex-wrap gap-3">
          <button
            @click="emit('action', item.id, 'pause', $event)"
            v-if="item.state === 'in_progress' || item.state === 'queued'"
            :disabled
            :aria-label="i18n.t('pauseVideo', [item.mediaIndex])"
            type="button"
            class="xvd-link"
          >
            {{ i18n.t('pause') }}
          </button>
          <button
            @click="emit('action', item.id, 'resume', $event)"
            v-if="item.state === 'paused'"
            :disabled
            :aria-label="i18n.t('resumeVideo', [item.mediaIndex])"
            type="button"
            class="xvd-link"
          >
            {{ i18n.t('resume') }}
          </button>
          <button
            @click="emit('action', item.id, 'cancel', $event)"
            v-if="!isTerminalDownload(item)"
            :disabled
            :aria-label="i18n.t('cancelVideo', [item.mediaIndex])"
            type="button"
            class="xvd-link"
          >
            {{ i18n.t('cancel') }}
          </button>
          <button
            @click="emit('action', item.id, 'retry', $event)"
            v-else-if="item.state !== 'complete'"
            :disabled
            :aria-label="i18n.t('retryVideo', [item.mediaIndex])"
            type="button"
            class="xvd-link"
          >
            {{ i18n.t('retry') }}
          </button>
          <button
            @click="emit('remove', item.id, $event)"
            v-if="canRemove && isTerminalDownload(item)"
            :disabled
            :aria-label="i18n.t('removeVideoRecord', [item.mediaIndex])"
            type="button"
            class="xvd-link"
          >
            {{ i18n.t('removeRecord') }}
          </button>
        </div>
      </div>
      <p class="break-all text-xs text-muted">{{ item.filename }}</p>
      <template v-if="item.state === 'in_progress' || item.state === 'paused'">
        <progress
          :value="percentage(item)"
          :max="100"
          :aria-label="i18n.t('videoProgress', [item.mediaIndex])"
          class="h-2 w-full accent-primary"
        />
        <p class="text-xs text-muted">
          {{ formatBytes(item.bytesReceived, i18n.t('unknownSize')) }} /
          {{ formatBytes(item.totalBytes, i18n.t('unknownSize'))
          }}<span v-if="percentage(item) !== undefined">
            · {{ percentage(item) }}%</span
          >
        </p>
      </template>
      <p
        v-if="item.state === 'interrupted'"
        class="text-xs text-danger"
      >
        {{ i18n.t('interruptedHelp', [item.error || i18n.t('networkError')]) }}
      </p>
    </div>
  </section>
</template>
