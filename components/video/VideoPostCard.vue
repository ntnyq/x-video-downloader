<script lang="ts" setup>
import VideoMediaRow from './VideoMediaRow.vue'
import type { VideoPost } from '~/types/video'
import type { VideoSelectionRow } from '~/utils/videoSelection'

interface Props {
  /**
   * Captured post whose videos and selection controls are displayed.
   */
  post: VideoPost
  /**
   * Media selection and quality resolved by the shared page controller.
   */
  rows: VideoSelectionRow[]
  /**
   * Whether download and selection controls are temporarily unavailable.
   */
  disabled: boolean
  /**
   * Whether the page is currently starting a download request.
   */
  isPending: boolean
  /**
   * Whether to offer a best-quality override alongside the current preference.
   */
  showHighest: boolean
  /**
   * Whether each batch video prompts for its own save location.
   */
  saveAs: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  /**
   * Updates a row's shared quality choice.
   */
  select: [key: string, url: string]
  /**
   * Updates a row's shared batch selection.
   */
  check: [key: string, checked: boolean]
  /**
   * Updates every downloadable row in this post.
   */
  selectAll: [checked: boolean]
  /**
   * Requests selected post videos or one media position using shared quality choices.
   */
  download: [event: MouseEvent, index?: number, highest?: boolean]
}>()

const downloadableCount = computed(
  () => props.rows.filter(row => row.variant).length,
)
const selectedCount = computed(
  () => props.rows.filter(row => row.checked).length,
)
const allSelected = computed(
  () =>
    downloadableCount.value > 0
    && downloadableCount.value === selectedCount.value,
)
const partiallySelected = computed(
  () => selectedCount.value > 0 && !allSelected.value,
)

/**
 * Applies the post checkbox state to its shared page selection.
 *
 * @param event - Change event expected from the post selection checkbox.
 */
function handleSelectAll(event: Event) {
  if (event.target instanceof HTMLInputElement) {
    emit('selectAll', event.target.checked)
  }
}
</script>

<template>
  <section class="border-t border-line py-4 first:border-t-0">
    <div class="mb-3 flex items-center gap-2">
      <input
        @change="handleSelectAll"
        v-if="downloadableCount"
        :checked="allSelected"
        :indeterminate="partiallySelected"
        :disabled
        :aria-label="i18n.t('selectPostVideos', [post.id])"
        type="checkbox"
        class="h-4 w-4 shrink-0 accent-primary xvd-focus"
      />
      <a
        :href="`https://x.com/i/status/${post.id}`"
        target="_blank"
        rel="noreferrer"
        class="min-w-0 break-all text-xs text-muted xvd-focus hover:text-ink"
      >
        {{ post.author ? `@${post.author}` : i18n.t('post') }} · {{ post.id }}
      </a>
    </div>
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
      <button
        @click="emit('download', $event)"
        :disabled="disabled || !selectedCount"
        type="button"
        class="w-full xvd-secondary"
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
        @click="emit('download', $event, undefined, true)"
        v-if="showHighest"
        :disabled="disabled || !selectedCount"
        type="button"
        class="xvd-link"
      >
        {{ i18n.t('useHighest') }}
      </button>
      <p
        v-if="downloadableCount > 1 && saveAs"
        class="text-xs text-muted"
      >
        {{ i18n.t('confirmEachSave') }}
      </p>
    </div>
    <div class="space-y-5">
      <VideoMediaRow
        @select="emit('select', row.key, $event)"
        @check="emit('check', row.key, $event)"
        @download="emit('download', $event, row.index)"
        v-for="row in rows"
        :key="row.key"
        :media="row.media"
        :index="row.index"
        :variant="row.variant"
        :checked="row.checked"
        :disabled
        selectable
      />
    </div>
  </section>
</template>
