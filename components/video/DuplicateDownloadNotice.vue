<script lang="ts" setup>
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
    class="my-3 rounded-xl bg-input p-3 text-sm space-y-3"
  >
    <p>{{ i18n.t('duplicateNotice', [count]) }}</p>
    <div class="flex flex-wrap gap-3">
      <button
        @click="emit('confirm', $event)"
        :disabled
        type="button"
        class="xvd-secondary"
      >
        {{ i18n.t('downloadAgain') }}
      </button>
      <button
        @click="emit('dismiss')"
        :disabled
        type="button"
        class="xvd-link"
      >
        {{ i18n.t('dismiss') }}
      </button>
    </div>
  </div>
</template>
