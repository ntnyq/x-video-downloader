<script lang="ts" setup>
import { i18n } from '#i18n'
import { Checkbox } from '~/components/ui/checkbox'
import { Label } from '~/components/ui/label'
import { useDownloadPreferences } from '~/composables/useDownloadPreferences'
import { usePageVideoSelection } from '~/composables/usePageVideoSelection'
import { usePostDownloads } from '~/composables/usePostDownloads'
import { MAX_DOWNLOAD_BATCH_SIZE } from '~/utils/download'
import BatchDownloadBar from './BatchDownloadBar.vue'
import DuplicateDownloadNotice from './DuplicateDownloadNotice.vue'
import VideoPostCard from './VideoPostCard.vue'
import type { VNode } from 'vue'
import type { VideoPost } from '~/types/video'
import type { VideoSelectionScope } from '~/utils/videoSelection'

const props = defineProps<{
  /**
   * Currently visible posts whose videos may be selected for a shared batch.
   */
  posts: VideoPost[]
  /** Hides redundant row actions for a single-video post. */
  singlePost?: boolean
}>()

defineSlots<{
  tools?: () => VNode[]
}>()

const { preferences, isReady, preferenceError } = useDownloadPreferences()
const {
  groups,
  selectedCount,
  downloadableCount,
  allSelected,
  isOverLimit,
  setUrl,
  setChecked,
  selectAll,
  requests,
} = usePageVideoSelection(
  () => props.posts,
  () => preferences.value.quality,
)
const {
  downloads,
  isPending,
  isActionPending,
  message,
  requestError,
  progressError,
  duplicateRequests,
  confirmDuplicates,
  dismissDuplicates,
  start,
  action,
} = usePostDownloads(undefined, () =>
  props.posts.map(post => post.id).join(','),
)

const isDisabled = computed(() => !isReady.value || isPending.value)
const isBatchDisabled = computed(
  () => isDisabled.value || !selectedCount.value || isOverLimit.value,
)
const partiallySelected = computed(
  () => selectedCount.value > 0 && !allSelected.value,
)
const visibleDownloads = computed(() => {
  const postIds = new Set(props.posts.map(post => post.id))
  return downloads.value.filter(download => postIds.has(download.postId))
})

/**
 * Submits a trusted page, post, or media download without truncating selections.
 *
 * @param event - Originating user click used to protect the download boundary.
 * @param scope - Optional post/media scope and best-quality override.
 */
function handleDownload(event: MouseEvent, scope?: VideoSelectionScope) {
  if (!event.isTrusted || isDisabled.value) {
    return
  }
  const selected = requests(scope)
  if (selected.length > MAX_DOWNLOAD_BATCH_SIZE) {
    return
  }
  start(selected)
}

/**
 * Sends a trusted action for an owned download to the shared controller.
 *
 * @param id - Native browser download identifier.
 * @param operation - Requested lifecycle action.
 * @param event - Originating trusted user interaction.
 */
function handleAction(
  id: number,
  operation: 'cancel' | 'retry' | 'pause' | 'resume',
  event: MouseEvent,
) {
  if (event.isTrusted) {
    action(id, operation)
  }
}

/**
 * Applies the page checkbox state to every visible downloadable video.
 *
 * @param value - Checked or mixed state from the page selection control.
 */
function handleSelectAll(value: boolean | 'indeterminate') {
  selectAll(value === true)
}

/**
 * Confirms duplicate downloads only after an explicit user interaction.
 *
 * @param event - Originating duplicate-confirmation click.
 */
function handleConfirmDuplicates(event: MouseEvent) {
  if (event.isTrusted) {
    confirmDuplicates()
  }
}
</script>

<template>
  <div class="min-h-0 flex flex-1 flex-col">
    <div
      class="mx-4 flex shrink-0 items-center justify-between gap-2 border-b border-border py-2"
    >
      <Label class="flex items-center gap-2 text-xs">
        <Checkbox
          @update:model-value="handleSelectAll"
          :model-value="partiallySelected ? 'indeterminate' : allSelected"
          :disabled="isDisabled || !downloadableCount"
        />
        {{ i18n.t('selectPageVideos') }}
      </Label>
      <div class="flex items-center gap-1 text-xs text-muted-foreground">
        <span>{{ i18n.t('availableVideos', [downloadableCount]) }}</span
        ><slot name="tools" />
      </div>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
      <DuplicateDownloadNotice
        @confirm="handleConfirmDuplicates"
        @dismiss="dismissDuplicates"
        :count="duplicateRequests.length"
        :disabled="isPending"
      />
      <p
        v-if="message"
        role="status"
        class="py-2 text-xs text-muted-foreground"
      >
        {{ message }}
      </p>
      <p
        v-if="requestError || preferenceError"
        role="alert"
        class="py-2 text-xs text-destructive"
      >
        {{ requestError || preferenceError }}
      </p>
      <p
        v-if="progressError"
        role="status"
        class="py-2 text-xs text-muted-foreground"
      >
        {{ progressError }}
      </p>
      <VideoPostCard
        @select="setUrl"
        @check="setChecked"
        @select-all="selectAll($event, group.post.id)"
        @download="handleDownload"
        @action="handleAction"
        v-for="group in groups"
        :key="group.post.id"
        :post="group.post"
        :rows="group.rows"
        :disabled="isDisabled"
        :downloads="
          visibleDownloads.filter(item => item.postId === group.post.id)
        "
        :action-disabled="isActionPending"
        :hide-download="singlePost && downloadableCount === 1"
      />
    </div>
    <BatchDownloadBar
      @download="handleDownload"
      v-if="downloadableCount"
      :count="selectedCount"
      :disabled="isBatchDisabled"
      :pending="isPending"
      :save-as="preferences.saveAs"
      :over-limit="isOverLimit"
    />
  </div>
</template>
