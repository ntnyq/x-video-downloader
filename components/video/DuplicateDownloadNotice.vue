<script lang="ts" setup>
import { i18n } from '#i18n'
import { Button } from '~/components/ui/button'

defineProps<{
  /**
   * Completed videos awaiting an explicit repeat-download choice.
   */
  count: number
  /**
   * Whether another download submission is in progress.
   */
  disabled: boolean
}>()
const emit = defineEmits<{
  /**
   * Confirms repeating only the previously completed videos.
   */
  confirm: [event: MouseEvent]
  /**
   * Dismisses the repeat-download choice.
   */
  dismiss: []
}>()
</script>

<template>
  <div
    v-if="count"
    role="status"
    class="my-3 rounded-xl bg-secondary p-3 text-sm space-y-3"
  >
    <p>{{ i18n.t('duplicateNotice', [count]) }}</p>
    <div class="flex flex-wrap gap-3">
      <Button
        @click="emit('confirm', $event)"
        :disabled
        variant="outline"
        type="button"
      >
        {{ i18n.t('downloadAgain') }}
      </Button>
      <Button
        @click="emit('dismiss')"
        :disabled
        variant="link"
        type="button"
      >
        {{ i18n.t('dismiss') }}
      </Button>
    </div>
  </div>
</template>
