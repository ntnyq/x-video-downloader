<script lang="ts" setup>
import { ICONS } from '~/constants/icon'
import { cn } from '~/lib/utils'
import type { HTMLAttributes } from 'vue'
import type { IconName } from '~/types/icon'

const props = defineProps<{
  /** Semantic symbol to render. */
  name: IconName
  /** Size or color overrides. */
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <component
    :is="ICONS[name]"
    :stroke-width="1.8"
    :class="cn('pointer-events-none size-5 shrink-0', props.class)"
    aria-hidden="true"
  />
</template>
