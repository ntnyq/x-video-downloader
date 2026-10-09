<script lang="ts" setup>
import { i18n } from '#i18n'
import { Button } from '~/components/ui/button'
import { useDownloadPreferences } from '~/composables/useDownloadPreferences'
import { usePageTheme } from '~/composables/usePageTheme'
import { useTheme } from '~/composables/useTheme'
import { useVideoDownload } from '~/composables/useVideoDownload'
import {
  createDownloadRequest,
  selectPreferredVariant,
} from '~/utils/preferences'
import DuplicateDownloadNotice from './DuplicateDownloadNotice.vue'
import type { VideoPost } from '~/types/video'

const props = defineProps<{
  /**
   * Captured post for the inline button, when its video data is available.
   */
  post?: VideoPost
}>()
const emit = defineEmits<{
  /**
   * Opens the floating panel to inspect or select the post videos.
   */
  open: []
}>()

const { preferences, isReady, preferenceError } = useDownloadPreferences()
const pageTheme = usePageTheme()
const { themeStyle } = useTheme()
const { isPending, message, hasError, download, duplicateRequest } =
  useVideoDownload(() => props.post?.id)

const downloadable = computed(
  () =>
    props.post?.media.flatMap((media, index) => {
      const variant = selectPreferredVariant(
        media.variants,
        preferences.value.quality,
      )
      return variant ? [{ variant, index: index + 1 }] : []
    }) ?? [],
)
const quickLabel = computed(() =>
  downloadable.value.length === 1
    ? preferences.value.quality === 'highest'
      ? i18n.t('downloadHighest')
      : i18n.t('quickDownload')
    : downloadable.value.length > 1
      ? i18n.t('selectVideos')
      : i18n.t('detectVideos'),
)

/**
 * Handles a trusted quick-download click using the saved quality preference.
 * The panel opens for ambiguous media selection or after a successful single download.
 *
 * @param event - User click used to verify that the action is trusted.
 * @returns A promise resolving after the click has been handled.
 */
async function handleQuick(event: MouseEvent) {
  if (!event.isTrusted || isPending.value) {
    return
  }
  const item = downloadable.value[0]
  if (!props.post || downloadable.value.length !== 1 || !item) {
    emit('open')
    return
  }
  if (
    await download(createDownloadRequest(props.post, item.index, item.variant))
  ) {
    emit('open')
  }
}
/**
 * Repeats the completed video only after a trusted confirmation click.
 */
async function confirmDuplicate(event: MouseEvent) {
  if (
    event.isTrusted
    && duplicateRequest.value
    && (await download(duplicateRequest.value, true))
  ) {
    emit('open')
  }
}

watch(
  () => props.post?.id,
  () => {
    duplicateRequest.value = undefined
  },
)
</script>

<template>
  <div
    :style="themeStyle"
    :data-xvd-theme="pageTheme"
    class="px-1 py-2 text-foreground font-sans"
  >
    <div class="flex flex-wrap items-center gap-2">
      <Button
        @click.stop.prevent="handleQuick"
        :disabled="!isReady || isPending"
        variant="outline"
        type="button"
        class="text-sm"
      >
        {{ isPending ? i18n.t('creatingDownload') : quickLabel }}
      </Button>
      <Button
        @click.stop.prevent="emit('open')"
        variant="link"
        type="button"
      >
        {{ i18n.t('qualityAndProgress') }}
      </Button>
    </div>
    <DuplicateDownloadNotice
      @confirm="confirmDuplicate"
      @dismiss="duplicateRequest = undefined"
      :count="duplicateRequest ? 1 : 0"
      :disabled="isPending"
    />
    <p
      v-if="hasError || preferenceError"
      role="status"
      class="mt-2 text-xs text-destructive"
    >
      {{ preferenceError || message }}
    </p>
  </div>
</template>
