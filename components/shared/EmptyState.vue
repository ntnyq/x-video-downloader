<script lang="ts" setup>
import type { VNode } from 'vue'

defineProps<{
  /** Short description of the current state. */
  title: string
  /** Next step, when the state needs explanation. */
  description?: string
}>()
defineSlots<{
  default?: () => VNode[]
}>()
</script>

<template>
  <div
    class="flex flex-col items-center px-5 py-10 text-center"
    role="status"
  >
    <div
      class="mb-4 flex size-11 items-center justify-center rounded-xl bg-secondary text-muted-foreground"
    >
      <UiIcon name="video" />
    </div>
    <h2 class="text-sm font-semibold">{{ title }}</h2>
    <p
      v-if="description"
      class="mt-2 max-w-72 text-xs text-muted-foreground leading-relaxed"
    >
      {{ description }}
    </p>
    <div class="mt-4"><slot /></div>
  </div>
</template>
