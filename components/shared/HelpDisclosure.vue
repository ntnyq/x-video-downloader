<script lang="ts" setup>
import type { VNode } from 'vue'

defineProps<{
  /** Label for the optional explanation. */
  title: string
}>()
defineSlots<{
  default: () => VNode[]
}>()
</script>

<template>
  <details class="group text-xs text-muted-foreground">
    <summary
      class="flex min-h-8 cursor-pointer list-none items-center gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span>{{ title }}</span
      ><UiIcon
        name="chevronDown"
        class="size-3 group-open:rotate-180"
      />
    </summary>
    <div class="pt-2 leading-relaxed space-y-3"><slot /></div>
  </details>
</template>
