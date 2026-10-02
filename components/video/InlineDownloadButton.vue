<script lang="ts" setup>
import { useDownloadPreferences } from '~/composables/useDownloadPreferences'
import { useVideoDownload } from '~/composables/useVideoDownload'
import {
  createDownloadRequest,
  selectPreferredVariant,
} from '~/utils/preferences'
import type { VideoPost } from '~/types/video'

const props = defineProps<{ post?: VideoPost }>()
const emit = defineEmits<{ open: [] }>()
const { preferences, isReady, preferenceError } = useDownloadPreferences()
const { isPending, message, hasError, download } = useVideoDownload()
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
</script>

<template>
  <div class="px-1 py-2 font-sans">
    <div class="flex flex-wrap items-center gap-2">
      <button
        @click.stop.prevent="handleQuick"
        :disabled="!isReady || isPending"
        type="button"
        class="xvd-secondary text-sm"
      >
        {{ isPending ? i18n.t('creatingDownload') : quickLabel }}
      </button>
      <button
        @click.stop.prevent="emit('open')"
        type="button"
        class="xvd-link"
      >
        {{ i18n.t('qualityAndProgress') }}
      </button>
    </div>
    <p
      v-if="hasError || preferenceError"
      role="status"
      class="mt-2 text-xs text-red-700"
    >
      {{ preferenceError || message }}
    </p>
  </div>
</template>
