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
  focus: () => buttonRef.value?.focus({ preventScroll: true }),
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
    class="pointer-events-auto fixed flex-center touch-none select-none border-0 rounded-full bg-primary p-0 text-white shadow-lg xvd-focus hover:bg-blue-700"
  >
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="pointer-events-none h-5 w-5"
    >
      <path d="M12 4v12m-5-5 5 5 5-5M5 17v3h14v-3" />
    </svg>
  </button>
</template>
