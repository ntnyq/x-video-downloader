<script lang="ts" setup>
import type { VNode } from 'vue'

defineProps<{
  /** Name of the extension or surface. */
  title: string
}>()
defineSlots<{
  default?: () => VNode[]
}>()
</script>

<template>
  <header
    class="flex shrink-0 items-center justify-between gap-3 bg-background px-4 py-3"
  >
    <div class="min-w-0 flex items-center gap-3">
      <UiIcon
        name="download"
        class="size-5"
      />
      <h1 class="min-w-0 text-sm font-semibold">{{ title }}</h1>
    </div>
    <div class="flex shrink-0 items-center gap-1"><slot /></div>
  </header>
</template>
