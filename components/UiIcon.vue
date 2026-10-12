<script lang="ts" setup>
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleHelpIcon,
  ClockIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  FilmIcon,
  HistoryIcon,
  KeyboardIcon,
  PaletteIcon,
  PauseIcon,
  PlayIcon,
  RefreshCwIcon,
  SearchIcon,
  Settings2Icon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
} from '@lucide/vue'
import { cn } from '~/lib/utils'
import type { HTMLAttributes } from 'vue'
import type { IconName } from '~/types/icon'

const props = defineProps<{
  /** Semantic symbol to render. */
  name: IconName
  /** Size or color overrides. */
  class?: HTMLAttributes['class']
}>()
const icons = {
  download: DownloadIcon,
  close: XIcon,
  settings: Settings2Icon,
  refresh: RefreshCwIcon,
  check: CheckIcon,
  video: FilmIcon,
  history: HistoryIcon,
  external: ExternalLinkIcon,
  chevronDown: ChevronDownIcon,
  pause: PauseIcon,
  play: PlayIcon,
  clock: ClockIcon,
  alert: TriangleAlertIcon,
  trash: Trash2Icon,
  file: FileTextIcon,
  palette: PaletteIcon,
  help: CircleHelpIcon,
  search: SearchIcon,
  back: ArrowLeftIcon,
  keyboard: KeyboardIcon,
}
</script>

<template>
  <component
    :is="icons[name]"
    :stroke-width="1.8"
    :class="cn('pointer-events-none size-5 shrink-0', props.class)"
    aria-hidden="true"
  />
</template>
