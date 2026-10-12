<script lang="ts" setup>
import { isUndefined } from '@ntnyq/utils'
import { i18n } from '#i18n'
import HelpDisclosure from '~/components/shared/HelpDisclosure.vue'
import IconButton from '~/components/shared/IconButton.vue'
import { Progress } from '~/components/ui/progress'
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
    class="divide-y divide-border"
  >
    <div
      v-for="item in downloads"
      :key="item.id"
      class="py-2 space-y-2"
    >
      <div class="flex items-start gap-2">
        <div
          class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground"
        >
          <UiIcon
            :name="
              item.state === 'complete'
                ? 'check'
                : item.state === 'interrupted'
                  ? 'alert'
                  : item.state === 'paused'
                    ? 'pause'
                    : item.state === 'queued'
                      ? 'clock'
                      : 'download'
            "
            class="size-4"
          />
        </div>
        <div class="min-w-0 flex-1">
          <HelpDisclosure
            :title="item.filename"
            class="[&_summary_span]:truncate [&_summary]:min-h-6 text-foreground"
          >
            <p class="break-all">{{ item.filename }}</p>
            <p>
              {{ i18n.t('post') }} {{ item.postId }} /
              {{ i18n.t('videoNumber', [item.mediaIndex]) }}
            </p>
            <p v-if="item.startedAt">
              {{
                new Intl.DateTimeFormat(i18n.t('uiLanguage'), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(item.startedAt)
              }}
            </p>
          </HelpDisclosure>
          <a
            v-if="showPost"
            :href="`https://x.com/i/status/${item.postId}`"
            target="_blank"
            rel="noreferrer"
            class="inline-flex max-w-full items-center gap-1 text-[11px] text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
            ><span class="truncate">{{
              item.author ? `@${item.author}` : i18n.t('post')
            }}</span
            ><UiIcon
              name="external"
              class="size-3"
          /></a>
        </div>
        <div class="flex shrink-0">
          <IconButton
            @click="emit('action', item.id, 'pause', $event)"
            v-if="item.state === 'in_progress' || item.state === 'queued'"
            :disabled
            :label="i18n.t('pauseVideo', [item.mediaIndex])"
            icon="pause"
          />
          <IconButton
            @click="emit('action', item.id, 'resume', $event)"
            v-if="item.state === 'paused'"
            :disabled
            :label="i18n.t('resumeVideo', [item.mediaIndex])"
            icon="play"
          />
          <IconButton
            @click="emit('action', item.id, 'cancel', $event)"
            v-if="!isTerminalDownload(item)"
            :disabled
            :label="i18n.t('cancelVideo', [item.mediaIndex])"
            icon="close"
          />
          <IconButton
            @click="emit('action', item.id, 'retry', $event)"
            v-else-if="item.state !== 'complete'"
            :disabled
            :label="i18n.t('retryVideo', [item.mediaIndex])"
            icon="refresh"
          />
          <IconButton
            @click="emit('remove', item.id, $event)"
            v-if="canRemove && isTerminalDownload(item)"
            :disabled
            :label="i18n.t('removeVideoRecord', [item.mediaIndex])"
            icon="trash"
          />
        </div>
      </div>
      <Progress
        v-if="item.state === 'in_progress' || item.state === 'paused'"
        :model-value="percentage(item)"
        :aria-label="i18n.t('videoProgress', [item.mediaIndex])"
        class="h-1"
      />
      <p
        class="flex flex-wrap justify-between gap-1 text-[11px] text-muted-foreground tabular-nums"
      >
        <span>{{ STATE_LABELS[item.state] }}</span>
        <span v-if="item.state === 'in_progress' || item.state === 'paused'">
          {{ formatBytes(item.bytesReceived, i18n.t('unknownSize')) }} /
          {{ formatBytes(item.totalBytes, i18n.t('unknownSize')) }}
          <span
            v-if="!isUndefined(percentage(item))"
            class="ml-1 font-medium"
            >{{ percentage(item) }}%</span
          >
        </span>
        <span v-else-if="item.state === 'complete' && item.bytesReceived > 0">{{
          formatBytes(item.bytesReceived, i18n.t('unknownSize'))
        }}</span>
      </p>
      <p
        v-if="item.state === 'interrupted'"
        class="text-xs text-destructive"
      >
        {{ i18n.t('interruptedHelp', [item.error || i18n.t('networkError')]) }}
      </p>
    </div>
  </section>
</template>
