<script lang="ts" setup>
import { TabsList, useForwardProps } from 'reka-ui'
import { computed } from 'vue'
import { cn } from '~/lib/utils'
import type { TabsListProps } from 'reka-ui'
import type { HTMLAttributes, VNode } from 'vue'

const props = defineProps<TabsListProps & { class?: HTMLAttributes['class'] }>()
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
  <TabsList
    v-bind="forwarded"
    :class="
      cn(
        'inline-flex h-12 w-full items-center gap-5 text-muted-foreground',
        props.class,
      )
    "
  >
    <slot />
  </TabsList>
</template>
