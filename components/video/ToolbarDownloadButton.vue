<script lang="ts" setup>
import { useTimeoutFn } from '@vueuse/core'
import { i18n } from '#i18n'
import IconButton from '~/components/shared/IconButton.vue'
import { usePageTheme } from '~/composables/usePageTheme'
import { usePostDownloads } from '~/composables/usePostDownloads'
import { useTheme } from '~/composables/useTheme'
import { createDownloadRequest } from '~/utils/download/requests'
import { selectPreferredVariant } from '~/utils/video/variants'
import DuplicateDownloadNotice from './DuplicateDownloadNotice.vue'
import type { VideoPost } from '~/types/video'

const props = defineProps<{
  /**
   * Captured video data associated with the surrounding post.
   */
  post?: VideoPost
}>()

const emit = defineEmits<{
  /**
   * Opens the existing download panel for this post.
   */
  open: []
}>()

const pageTheme = usePageTheme()
const { themeStyle } = useTheme()
const {
  isPending,
  requestError,
  submitDownloadRequests,
  duplicateRequests,
  confirmDuplicates,
  dismissDuplicates,
} = usePostDownloads(() => props.post?.id ?? '', undefined, {
  autoRefresh: false,
})

// Defer pointer clicks so a double-click queues downloads without opening the panel.
const { start: openPanelLater, stop: cancelPanelOpen } = useTimeoutFn(
  () => emit('open'),
  400,
  { immediate: false },
)

const highestRequests = computed(() => {
  const post = props.post

  return (
    post?.media.flatMap((media, index) => {
      const variant = selectPreferredVariant(media.variants, 'highest')

      return variant ? [createDownloadRequest(post, index + 1, variant)] : []
    }) ?? []
  )
})

/**
 * Opens the panel after a pointer single-click, or immediately for keyboard activation.
 */
function handleClick(event: MouseEvent) {
  cancelPanelOpen()

  if (!event.isTrusted || isPending.value) {
    return
  }

  if (event.detail === 0) {
    emit('open')
  } else if (event.detail === 1) {
    openPanelLater()
  }
}

/**
 * Queues every downloadable video at its highest quality after a trusted double-click.
 */
async function handleDoubleClick(event: MouseEvent) {
  cancelPanelOpen()

  if (!event.isTrusted || isPending.value) {
    return
  }

  if (!highestRequests.value.length) {
    emit('open')

    return
  }

  await submitDownloadRequests(highestRequests.value)
}

/**
 * Keeps completed-download confirmation behind a trusted user gesture.
 */
function confirmDuplicate(event: MouseEvent) {
  if (event.isTrusted) {
    return confirmDuplicates()
  }
}

watch(
  () => props.post?.id,
  () => {
    cancelPanelOpen()
    dismissDuplicates()
  },
  { flush: 'sync' },
)
</script>

<template>
  <div
    :style="themeStyle"
    :data-xvd-theme="pageTheme"
    class="relative text-foreground font-sans"
  >
    <IconButton
      @click.stop.prevent="handleClick"
      @dblclick.stop.prevent="handleDoubleClick"
      :label="i18n.t('download.toolbarHint')"
      :disabled="isPending"
      :aria-busy="isPending"
      icon="download"
      class="rounded-full [&_svg]:size-5 hover:bg-[#1d9bf0]/10 hover:text-[#1d9bf0] dark:hover:bg-[#1d9bf0]/10"
    />
    <div
      @click.stop
      @dblclick.stop
      v-if="duplicateRequests.length || requestError"
      class="absolute top-full right-0 z-20 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-background p-2 shadow-sm"
    >
      <DuplicateDownloadNotice
        @confirm="confirmDuplicate"
        @dismiss="dismissDuplicates"
        :count="duplicateRequests.length"
        :disabled="isPending"
      />
      <p
        v-if="requestError"
        role="status"
        class="text-xs text-destructive"
      >
        {{ requestError }}
      </p>
    </div>
  </div>
</template>
