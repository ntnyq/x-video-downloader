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
        'inline-flex h-full items-center justify-center gap-1.5 whitespace-nowrap border-b-2 border-transparent text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 data-[state=active]:border-foreground data-[state=active]:text-foreground',
        props.class,
      )
    "
  >
    <slot />
  </TabsTrigger>
</template>
