<script lang="ts" setup>
import { i18n } from '#i18n'
import { Button } from '~/components/ui/button'
import { Checkbox } from '~/components/ui/checkbox'
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
 * @param value - Checked or mixed state from the post selection control.
 */
function handleSelectAll(value: boolean | 'indeterminate') {
  emit('selectAll', value === true)
}
</script>

<template>
  <section class="border-t border-border py-4 first:border-t-0">
    <div class="mb-3 flex items-center gap-2">
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
        class="min-w-0 break-all text-xs text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 hover:text-foreground"
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
      <Button
        @click="emit('download', $event)"
        :disabled="disabled || !selectedCount"
        variant="outline"
        type="button"
        class="w-full"
      >
        {{
          isPending
            ? i18n.t('creatingDownload')
            : downloadableCount > 1
              ? i18n.t('downloadSelected', [selectedCount])
              : i18n.t('oneClickDownload')
        }}
      </Button>
      <Button
        @click="emit('download', $event, undefined, true)"
        v-if="showHighest"
        :disabled="disabled || !selectedCount"
        variant="link"
        type="button"
      >
        {{ i18n.t('useHighest') }}
      </Button>
      <p
        v-if="downloadableCount > 1 && saveAs"
        class="text-xs text-muted-foreground"
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
