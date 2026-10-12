<script lang="ts" setup>
import { i18n } from '#i18n'
import { Checkbox } from '~/components/ui/checkbox'
import DownloadProgress from './DownloadProgress.vue'
import VideoMediaRow from './VideoMediaRow.vue'
import type { DownloadStatus } from '~/types/download'
import type { VideoPost } from '~/types/video'
import type {
  VideoSelectionRow,
  VideoSelectionScope,
} from '~/utils/videoSelection'

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
  /** Tasks associated with this post. */
  downloads: DownloadStatus[]
  /** Whether lifecycle actions are pending. */
  actionDisabled: boolean
  /** Whether the footer already offers the only video download. */
  hideDownload?: boolean
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
  download: [event: MouseEvent, scope: VideoSelectionScope]
  /** Controls a task next to its source video. */
  action: [
    id: number,
    operation: 'cancel' | 'retry' | 'pause' | 'resume',
    event: MouseEvent,
  ]
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
 * @param value - Checked or mixed state from the post selection control.
 */
function handleSelectAll(value: boolean | 'indeterminate') {
  emit('selectAll', value === true)
}

/**
 * Adds the current post to the requested media download scope.
 */
function handleDownload(event: MouseEvent, mediaIndex?: number) {
  emit('download', event, { postId: props.post.id, mediaIndex })
}

/**
 * Forwards the download action and its originating click unchanged.
 */
function handleAction(
  id: number,
  operation: 'cancel' | 'retry' | 'pause' | 'resume',
  event: MouseEvent,
) {
  emit('action', id, operation, event)
}
</script>

<template>
  <section class="border-t border-border py-3 first:border-t-0">
    <div class="mb-2 flex items-center gap-2">
      <Checkbox
        @update:model-value="handleSelectAll"
        v-if="downloadableCount"
        :model-value="partiallySelected ? 'indeterminate' : allSelected"
        :disabled
        :aria-label="i18n.t('selectPostVideos', [post.id])"
      />
      <a
        :href="`https://x.com/i/status/${post.id}`"
        target="_blank"
        rel="noreferrer"
        class="min-w-0 inline-flex items-center gap-2 truncate text-xs font-semibold focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 hover:text-foreground"
      >
        {{ post.author ? `@${post.author}` : i18n.t('post')
        }}<UiIcon
          name="external"
          class="size-3"
        />
      </a>
    </div>
    <p
      v-if="post.text"
      class="mb-2 truncate text-xs text-muted-foreground"
    >
      {{ post.text }}
    </p>
    <div class="space-y-2">
      <VideoMediaRow
        @select="emit('select', row.key, $event)"
        @check="emit('check', row.key, $event)"
        @download="handleDownload($event, row.index)"
        v-for="row in rows"
        :key="row.key"
        :media="row.media"
        :index="row.index"
        :variant="row.variant"
        :checked="row.checked"
        :disabled
        :hide-download
        selectable
      >
        <DownloadProgress
          @action="handleAction"
          :downloads="downloads.filter(item => item.mediaIndex === row.index)"
          :disabled="actionDisabled"
        />
      </VideoMediaRow>
    </div>
  </section>
</template>
