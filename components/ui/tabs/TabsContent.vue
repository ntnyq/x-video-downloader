<script lang="ts" setup>
import { TabsContent, useForwardProps } from 'reka-ui'
import { computed } from 'vue'
import { cn } from '~/lib/utils'
import type { TabsContentProps } from 'reka-ui'
import type { HTMLAttributes, VNode } from 'vue'

const props = defineProps<
  TabsContentProps & { class?: HTMLAttributes['class'] }
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
  <TabsContent
    v-bind="forwarded"
    :class="
      cn(
        'flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring',
        props.class,
      )
    "
  >
    <slot />
  </TabsContent>
</template>
