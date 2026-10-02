<script lang="ts" setup>
import { useDownloadPreferences } from '~/composables/useDownloadPreferences'
import { usePostDownloads } from '~/composables/usePostDownloads'
import { useVideoSelection } from '~/composables/useVideoSelection'
import DownloadProgress from './DownloadProgress.vue'
import VideoMediaRow from './VideoMediaRow.vue'
import type { VideoPost } from '~/types/video'

const props = defineProps<{
  /**
   * Captured post whose videos, selections, and download progress are displayed.
   */
  post: VideoPost
}>()

const { preferences, isReady, preferenceError } = useDownloadPreferences()
const {
  rows,
  downloadableCount,
  selectedCount,
  allSelected,
  setUrl,
  setChecked,
  selectAll,
  requests,
} = useVideoSelection(
  () => props.post,
  () => preferences.value.quality,
)
const {
  downloads,
  isPending,
  isActionPending,
  message,
  requestError,
  progressError,
  start,
  action,
} = usePostDownloads(() => props.post.id)

const isDisabled = computed(() => !isReady.value || isPending.value)

/**
 * Starts the selected batch or a single video after checking user intent and readiness.
 *
 * @param event - Click event that must originate from a trusted user interaction.
 * @param index - Optional one-based media position; omitted to download the selected batch.
 * @param highest - Whether to override the selected quality with the highest available version.
 */
function handleDownload(event: MouseEvent, index?: number, highest = false) {
  if (!event.isTrusted || isDisabled.value) {
    return
  }
  start(requests(index, highest))
}

/**
 * Forwards a trusted cancellation or retry action to the post download controller.
 *
 * @param id - Browser download identifier targeted by the action.
 * @param operation - Whether to cancel the download or retry it.
 * @param event - Click event used to verify a trusted user interaction.
 */
function handleAction(
  id: number,
  operation: 'cancel' | 'retry',
  event: MouseEvent,
) {
  if (event.isTrusted) {
    action(id, operation)
  }
}

/**
 * Applies the select-all checkbox state to every downloadable video.
 *
 * @param event - Change event expected from the select-all checkbox.
 */
function handleSelectAll(event: Event) {
  if (event.target instanceof HTMLInputElement) {
    selectAll(event.target.checked)
  }
}
</script>

<template>
  <section class="border-t border-line py-4 first:border-t-0">
    <a
      :href="`https://x.com/i/status/${post.id}`"
      target="_blank"
      rel="noreferrer"
      class="mb-3 block text-xs text-muted xvd-focus hover:text-primary"
    >
      {{ post.author ? `@${post.author}` : i18n.t('post') }} · {{ post.id }}
    </a>
    <p
      v-if="post.text"
      class="line-clamp-2 mb-4 text-sm leading-relaxed"
    >
      {{ post.text }}
    </p>
    <div
      v-if="downloadableCount"
      class="mb-4 space-y-3"
    >
      <label
        v-if="downloadableCount > 1"
        class="flex items-center gap-2 text-xs"
      >
        <input
          @change="handleSelectAll"
          :checked="allSelected"
          :disabled="isDisabled"
          type="checkbox"
          class="h-4 w-4 accent-primary xvd-focus"
        />
        {{ i18n.t('selectAll', [selectedCount, downloadableCount]) }}
      </label>
      <button
        @click="handleDownload($event)"
        :disabled="isDisabled || !selectedCount"
        type="button"
        class="w-full xvd-primary"
      >
        {{
          isPending
            ? i18n.t('creatingDownload')
            : downloadableCount > 1
              ? i18n.t('downloadSelected', [selectedCount])
              : i18n.t('oneClickDownload')
        }}
      </button>
      <button
        @click="handleDownload($event, undefined, true)"
        v-if="preferences.quality !== 'highest'"
        :disabled="isDisabled || !selectedCount"
        type="button"
        class="xvd-link"
      >
        {{ i18n.t('useHighest') }}
      </button>
      <p
        v-if="downloadableCount > 1 && preferences.saveAs"
        class="text-xs text-muted"
      >
        {{ i18n.t('confirmEachSave') }}
      </p>
    </div>
    <div class="space-y-5">
      <VideoMediaRow
        @select="setUrl(row.media.id, $event)"
        @check="setChecked(row.media.id, $event)"
        @download="handleDownload($event, row.index)"
        v-for="row in rows"
        :key="row.media.id"
        :media="row.media"
        :index="row.index"
        :variant="row.variant"
        :checked="row.checked"
        :selectable="downloadableCount > 1"
        :disabled="isDisabled"
      />
    </div>
    <p
      v-if="message"
      role="status"
      class="mt-3 text-xs text-muted"
    >
      {{ message }}
    </p>
    <p
      v-if="requestError || preferenceError"
      role="alert"
      class="mt-3 text-xs text-red-700"
    >
      {{ requestError || preferenceError }}
    </p>
    <DownloadProgress
      @action="handleAction"
      :downloads
      :disabled="isActionPending"
    />
    <p
      v-if="progressError"
      role="status"
      class="mt-3 text-xs text-muted"
    >
      {{ progressError }}
    </p>
  </section>
</template>
