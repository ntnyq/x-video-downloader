<script lang="ts" setup>
import type { VNode } from 'vue'
import type { IconName } from '~/types/icon'

defineProps<{
  /** Section heading. */
  title: string
  /** Section symbol. */
  icon: IconName
}>()
defineSlots<{
  default: () => VNode[]
  actions?: () => VNode[]
}>()
const headingId = useId()
</script>

<template>
  <section
    :aria-labelledby="headingId"
    class="border-b border-border py-6 space-y-5"
  >
    <div class="flex items-center justify-between gap-3">
      <h2
        :id="headingId"
        class="flex items-center gap-2 text-sm font-semibold"
      >
        <UiIcon
          :name="icon"
          class="size-4"
        />{{ title }}
      </h2>
      <slot name="actions" />
    </div>
    <slot />
  </section>
</template>
