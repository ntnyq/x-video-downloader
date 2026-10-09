<script lang="ts" setup>
import {
  CheckIcon,
  DownloadIcon,
  RefreshCwIcon,
  Settings2Icon,
  XIcon,
} from '@lucide/vue'

defineProps<{
  name: 'download' | 'close' | 'settings' | 'refresh' | 'check'
}>()
const icons = {
  download: DownloadIcon,
  close: XIcon,
  settings: Settings2Icon,
  refresh: RefreshCwIcon,
  check: CheckIcon,
}
</script>

<template>
  <component
    :is="icons[name]"
    :stroke-width="1.8"
    aria-hidden="true"
    class="pointer-events-none size-5 shrink-0"
  />
</template>
