<script lang="ts" setup>
import { reactiveOmit } from '@vueuse/core'
import { Label, useForwardProps } from 'reka-ui'
import { cn } from '~/lib/utils'
import type { LabelProps } from 'reka-ui'
import type { HTMLAttributes, VNode } from 'vue'

const props = defineProps<LabelProps & { class?: HTMLAttributes['class'] }>()
defineSlots<{
  default: () => VNode[]
}>()
const forwarded = useForwardProps(reactiveOmit(props, 'class'))
</script>

<template>
  <Label
    v-bind="forwarded"
    :class="
      cn(
        'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        props.class,
      )
    "
    data-slot="label"
  >
    <slot />
  </Label>
</template>
