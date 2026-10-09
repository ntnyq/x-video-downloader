<script lang="ts" setup>
import { TabsTrigger, useForwardProps } from 'reka-ui'
import { computed } from 'vue'
import { cn } from '~/lib/utils'
import type { TabsTriggerProps } from 'reka-ui'
import type { HTMLAttributes, VNode } from 'vue'

const props = defineProps<
  TabsTriggerProps & { class?: HTMLAttributes['class'] }
>()
defineSlots<{
  default: () => VNode[]
}>()
const delegated = computed(() => {
  const { class: _, ...rest } = props
  return rest
})
const forwarded = useForwardProps(delegated)
</script>

<template>
  <TabsTrigger
    v-bind="forwarded"
    :class="
      cn(
        'inline-flex min-h-9 items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
        props.class,
      )
    "
  >
    <slot />
  </TabsTrigger>
</template>
