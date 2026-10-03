<script lang="ts" setup>
import { useFloatingLauncher } from '~/composables/useFloatingLauncher'
import type { VNode } from 'vue'

defineProps<{
  /**
   * Whether the associated download panel is expanded.
   */
  isOpen: boolean
  /**
   * Accessible identifier of the associated panel.
   */
  panelId: string
}>()
const emit = defineEmits<{
  toggle: []
}>()
defineSlots<{
  default: () => VNode[]
}>()

const buttonRef = useTemplateRef('buttonRef')
const {
  isDragging,
  buttonStyle,
  panelStyle,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  shouldToggle,
} = useFloatingLauncher(buttonRef)

defineExpose({
  /**
   * Restores keyboard focus when the download panel closes.
   */
  focus() {
    buttonRef.value?.focus({ preventScroll: true })
  },
})
</script>

<template>
  <div
    v-if="isOpen"
    :style="panelStyle"
    class="pointer-events-auto fixed"
  >
    <slot />
  </div>
  <button
    @click.stop="shouldToggle($event) && emit('toggle')"
    @pointerdown.stop="onPointerDown"
    @pointermove.stop="onPointerMove"
    @pointerup.stop="onPointerUp"
    @pointercancel.stop="onPointerCancel"
    @lostpointercapture="onPointerCancel"
    @dragstart.prevent
    ref="buttonRef"
    :aria-label="isOpen ? i18n.t('closePanel') : i18n.t('downloadVideos')"
    :title="isOpen ? i18n.t('closePanel') : i18n.t('downloadVideos')"
    :aria-expanded="isOpen"
    :aria-controls="panelId"
    :style="buttonStyle"
    :class="
      isDragging
        ? 'cursor-grabbing transition-none'
        : 'cursor-grab transition-[left,top,background-color] duration-200 ease-out motion-reduce:transition-none'
    "
    type="button"
    class="xvd-panel-shadow pointer-events-auto fixed flex-center touch-none select-none border border-control-line rounded-full bg-background p-0 text-ink xvd-focus hover:bg-hover"
  >
    <UiIcon :name="isOpen ? 'close' : 'download'" />
  </button>
</template>
