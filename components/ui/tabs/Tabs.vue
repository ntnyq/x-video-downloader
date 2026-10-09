<script lang="ts" setup>
import { TabsRoot, useForwardPropsEmits } from 'reka-ui'
import { computed } from 'vue'
import { cn } from '~/lib/utils'
import type { TabsRootEmits, TabsRootProps } from 'reka-ui'
import type { HTMLAttributes, VNode } from 'vue'

const props = defineProps<TabsRootProps & { class?: HTMLAttributes['class'] }>()
const emit = defineEmits<TabsRootEmits>()
defineSlots<{
  default: () => VNode[]
}>()
const delegated = computed(() => {
  const { class: _, ...rest } = props
  return rest
})
const forwarded = useForwardPropsEmits(delegated, emit)
</script>

<template>
  <TabsRoot
    v-bind="forwarded"
    :class="cn('flex flex-col', props.class)"
  >
    <slot />
  </TabsRoot>
</template>
