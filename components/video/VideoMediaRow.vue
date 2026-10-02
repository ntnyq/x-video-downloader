<script lang="ts" setup>
import { formatVariant } from '~/utils/video'
import type { VideoMedia, VideoVariant } from '~/types/video'

interface Props {
  /** Available versions of this video. */
  media: VideoMedia
  /** One-based position in the post. */
  index: number
  /** Effective manual choice or saved quality preference. */
  variant?: VideoVariant
  /** Whether this video is included in the batch. */
  checked: boolean
  /** Whether the post has multiple downloadable videos. */
  selectable: boolean
  /** Whether a save operation is pending. */
  disabled: boolean
}
defineProps<Props>()
const emit = defineEmits<{
  select: [url: string]
  check: [checked: boolean]
  download: [event: MouseEvent]
}>()
const selectId = useId()

function handleSelect(event: Event) {
  if (event.target instanceof HTMLSelectElement) {
    emit('select', event.target.value)
  }
}
function handleCheck(event: Event) {
  if (event.target instanceof HTMLInputElement) {
    emit('check', event.target.checked)
  }
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <input
          @change="handleCheck"
          v-if="selectable && variant"
          :checked
          :disabled
          :aria-label="i18n.t('selectVideo', [index])"
          type="checkbox"
          class="h-4 w-4 accent-primary xvd-focus"
        />
        <label
          :for="selectId"
          class="text-sm font-semibold"
          >{{ i18n.t('videoNumber', [index]) }}</label
        >
      </div>
      <span class="text-xs text-muted">{{ variant ? 'MP4' : 'HLS' }}</span>
    </div>
    <template v-if="variant">
      <select
        @change="handleSelect"
        :value="variant.url"
        :disabled
        :id="selectId"
        class="w-full xvd-input"
      >
        <option
          v-for="(item, variantIndex) in media.variants"
          :key="item.url"
          :value="item.url"
        >
          {{ formatVariant(item, i18n.t('originalMp4')) }}
          {{ variantIndex === 0 ? i18n.t('highestSuffix') : '' }}
        </option>
      </select>
      <button
        @click="emit('download', $event)"
        :disabled
        type="button"
        class="w-full xvd-secondary"
      >
        {{ i18n.t('saveVideo', [index]) }}
      </button>
    </template>
    <p
      v-else
      class="text-sm text-muted leading-relaxed"
    >
      {{ i18n.t('hlsUnsupported') }}
    </p>
  </div>
</template>
