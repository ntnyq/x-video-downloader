<script lang="ts" setup>
import { onClickOutside } from '@vueuse/core'
import { i18n } from '#i18n'
import { browser } from '#imports'
import IconButton from '~/components/shared/IconButton.vue'
import SurfaceHeader from '~/components/shared/SurfaceHeader.vue'
import DownloadWorkspace from '~/components/video/DownloadWorkspace.vue'
import FloatingDownloadLauncher from '~/components/video/FloatingDownloadLauncher.vue'
import { provideOverlayTarget } from '~/composables/useOverlayTarget'
import { usePageTheme } from '~/composables/usePageTheme'
import { useTheme } from '~/composables/useTheme'
import { isRecord } from '~/utils/video'
import type { PageVideos } from '~/types/video'

interface Props {
  /**
   * Videos associated with posts on the current page.
   */
  snapshot: PageVideos
  /**
   * Whether the floating download panel is visible.
   */
  isOpen: boolean
  /**
   * Post selected by an inline button, when a post filter is active.
   */
  selectedPostId?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  /**
   * Requests that the floating download panel be opened.
   */
  open: []
  /**
   * Requests that the floating download panel be closed.
   */
  close: []
  /**
   * Requests a capture replay and a fresh scan of page videos.
   */
  refresh: []
  /**
   * Clears the post filter to display all captured page videos.
   */
  showAll: []
}>()

const pageTheme = usePageTheme()
const { themeStyle } = useTheme()
const panelId = useId()
const surfaceRef = useTemplateRef('surfaceRef')
const closeButtonRef = useTemplateRef('closeButtonRef')
const toggleButtonRef = useTemplateRef('toggleButtonRef')
const settingsError = shallowRef('')
const overlayRef = useTemplateRef('overlayRef')

provideOverlayTarget(overlayRef)

// Include the launcher and portalled menus in the same outside-click boundary.
onClickOutside(surfaceRef, () => {
  if (props.isOpen) {
    emit('close')
  }
})

/**
 * Asks the background to open settings because content scripts lack openOptionsPage.
 */
async function openSettings() {
  settingsError.value = ''
  try {
    const response: unknown = await browser.runtime.sendMessage({
      type: 'open-settings',
    })
    const { ok } = isRecord(response) ? response : { ok: false }
    if (ok !== true) {
      settingsError.value = i18n.t('actionFailed')
    }
  } catch {
    settingsError.value = i18n.t('actionFailed')
  }
}

watch(
  () => props.isOpen,
  async value => {
    await nextTick()
    if (value) {
      closeButtonRef.value?.focus()
    } else {
      toggleButtonRef.value?.focus()
    }
  },
)
</script>

<template>
  <aside
    @keydown.esc.stop="emit('close')"
    ref="surfaceRef"
    :style="themeStyle"
    :data-xvd-theme="pageTheme"
    :aria-label="i18n.t('extensionName')"
    class="pointer-events-none fixed inset-0 z-2147483647 text-foreground font-sans"
  >
    <FloatingDownloadLauncher
      @toggle="isOpen ? emit('close') : emit('open')"
      ref="toggleButtonRef"
      :is-open
      :panel-id
    >
      <section
        v-if="isOpen"
        :aria-label="i18n.t('panelOptions')"
        :id="panelId"
        class="animate-in fade-in zoom-in-95 duration-150 motion-reduce:animate-none xvd-panel-shadow max-h-[inherit] w-full flex flex-col overflow-hidden overscroll-contain border border-border rounded-2xl bg-background"
      >
        <SurfaceHeader :title="i18n.t('extensionName')">
          <IconButton
            @click="openSettings"
            :label="i18n.t('settings')"
            icon="settings"
          />
          <IconButton
            @click="emit('close')"
            ref="closeButtonRef"
            :label="i18n.t('closePanel')"
            icon="close"
          />
        </SurfaceHeader>
        <p
          v-if="settingsError"
          role="alert"
          class="px-5 pt-3 text-xs text-destructive"
        >
          {{ settingsError }}
        </p>
        <DownloadWorkspace
          @refresh="emit('refresh')"
          @show-all="emit('showAll')"
          :snapshot
          :selected-post-id
        />
      </section>
    </FloatingDownloadLauncher>
    <div ref="overlayRef" />
  </aside>
</template>
