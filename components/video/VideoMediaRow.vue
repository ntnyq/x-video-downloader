<script lang="ts" setup>
import { i18n } from '#i18n'
import IconButton from '~/components/shared/IconButton.vue'
import { Checkbox } from '~/components/ui/checkbox'
import { Label } from '~/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { formatVariant } from '~/utils/video'
import type { VNode } from 'vue'
import type { VideoMedia, VideoVariant } from '~/types/video'

interface Props {
  /**
   * Available MP4 versions and HLS detection state for this video.
   */
  media: VideoMedia
  /**
   * One-based position of this video within the post.
   */
  index: number
  /**
   * Effective manual quality choice or version selected by the saved preference.
   */
  variant?: VideoVariant
  /**
   * Whether this video is included in the batch download.
   */
  checked: boolean
  /**
   * Whether to show this video's checkbox in the shared batch selection.
   */
  selectable: boolean
  /**
   * Whether download and selection controls are temporarily unavailable.
   */
  disabled: boolean
  /** Hides the row action when the footer is sufficient. */
  hideDownload?: boolean
}

defineProps<Props>()
const emit = defineEmits<{
  /**
   * Reports the MP4 URL chosen in the quality selector.
   */
  select: [url: string]
  /**
   * Reports whether this video should be included in the batch.
   */
  check: [checked: boolean]
  /**
   * Requests a single-video download with the originating click event.
   */
  download: [event: MouseEvent]
}>()

defineSlots<{
  default?: () => VNode[]
}>()
const selectId = useId()

/**
 * Applies the row checkbox state to its shared batch selection.
 */
function handleCheck(value: boolean | 'indeterminate') {
  emit('check', value === true)
}
</script>

<template>
  <div>
    <div class="flex min-h-12 items-center gap-2">
      <Checkbox
        @update:model-value="handleCheck"
        v-if="selectable"
        :model-value="checked"
        :disabled="disabled || !variant"
        :aria-label="i18n.t('selectVideo', [index])"
      />
      <div
        class="flex h-10 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground"
      >
        <UiIcon
          name="video"
          class="size-4"
        />
      </div>
      <div class="min-w-0 flex-1">
        <Label
          :for="variant ? selectId : undefined"
          class="text-xs font-medium"
        >
          {{ i18n.t('videoNumber', [index]) }}
        </Label>
        <p class="mt-1 text-[11px] text-muted-foreground">
          {{ variant ? 'MP4' : i18n.t('hlsShort') }}
        </p>
      </div>
      <template v-if="variant">
        <Select
          @update:model-value="emit('select', $event)"
          :model-value="variant.url"
          :disabled
        >
          <SelectTrigger
            :aria-label="i18n.t('videoQuality', [index])"
            :id="selectId"
            class="h-8 w-auto max-w-32 border-0 bg-transparent px-2 text-xs shadow-none"
          >
            <SelectValue>{{
              variant.width && variant.height
                ? `${Math.min(variant.width, variant.height)}p`
                : i18n.t('originalMp4')
            }}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="(item, variantIndex) in media.variants"
              :key="item.url"
              :value="item.url"
              >{{ formatVariant(item, i18n.t('originalMp4')) }}
              {{
                variantIndex === 0 ? i18n.t('highestSuffix') : ''
              }}</SelectItem
            >
          </SelectContent>
        </Select>
        <IconButton
          @click="emit('download', $event)"
          v-if="!hideDownload"
          :disabled
          :label="i18n.t('saveVideo', [index])"
          icon="download"
        />
      </template>
      <span
        v-else
        :title="i18n.t('hlsUnsupported')"
        class="px-2 text-muted-foreground"
      >
        <UiIcon
          name="help"
          class="size-4"
        />
      </span>
    </div>
    <slot />
  </div>
</template>
