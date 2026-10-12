<script lang="ts" setup>
import { i18n } from '#i18n'
import { Button } from '~/components/ui/button'
import { MAX_DOWNLOAD_BATCH_SIZE } from '~/constants/download'

interface Props {
  /** Number of checked downloadable videos. */
  count: number
  /** Prevents an invalid or duplicate submission. */
  disabled: boolean
  /** Whether the request is being submitted. */
  pending: boolean
  /** Whether each file needs a save dialog. */
  saveAs: boolean
  /** Whether the selection exceeds the batch limit. */
  overLimit: boolean
}
defineProps<Props>()
const emit = defineEmits<{
  download: [event: MouseEvent]
}>()
</script>

<template>
  <footer class="shrink-0 border-t border-border bg-background p-4">
    <div class="flex items-center justify-between gap-3">
      <span
        role="status"
        class="text-xs text-muted-foreground tabular-nums"
        >{{ i18n.t('selectedVideos', [count]) }}</span
      >
      <Button
        @click="emit('download', $event)"
        :disabled
        class="text-xs"
        ><UiIcon name="download" />{{
          pending ? i18n.t('creatingDownload') : i18n.t('downloadSelection')
        }}</Button
      >
    </div>
    <p
      v-if="overLimit"
      role="alert"
      class="mt-2 text-xs text-destructive"
    >
      {{ i18n.t('batchLimitExceeded', [MAX_DOWNLOAD_BATCH_SIZE, count]) }}
    </p>
    <p
      v-if="count > 1 && saveAs"
      class="mt-2 text-xs text-muted-foreground"
    >
      {{ i18n.t('confirmEachSave') }}
    </p>
  </footer>
</template>
