<script lang="ts" setup>
import { i18n } from '#i18n'
import { Button } from '~/components/ui/button'
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

const selectId = useId()
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <Checkbox
          @update:model-value="value => emit('check', value === true)"
          v-if="selectable && variant"
          :model-value="checked"
          :disabled
          :aria-label="i18n.t('selectVideo', [index])"
        />
        <Label
          :for="selectId"
          class="text-sm font-semibold"
          >{{ i18n.t('videoNumber', [index]) }}</Label
        >
      </div>
      <span class="text-xs text-muted-foreground">{{
        variant ? 'MP4' : 'HLS'
      }}</span>
    </div>
    <template v-if="variant">
      <Select
        @update:model-value="value => emit('select', value)"
        :model-value="variant.url"
        :disabled
      >
        <SelectTrigger :id="selectId">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="(item, variantIndex) in media.variants"
            :key="item.url"
            :value="item.url"
          >
            {{ formatVariant(item, i18n.t('originalMp4')) }}
            {{ variantIndex === 0 ? i18n.t('highestSuffix') : '' }}
          </SelectItem>
        </SelectContent>
      </Select>
      <Button
        @click="emit('download', $event)"
        :disabled
        variant="outline"
        type="button"
        class="w-full"
      >
        {{ i18n.t('saveVideo', [index]) }}
      </Button>
    </template>
    <p
      v-else
      class="text-sm text-muted-foreground leading-relaxed"
    >
      {{ i18n.t('hlsUnsupported') }}
    </p>
  </div>
</template>
