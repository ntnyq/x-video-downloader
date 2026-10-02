<script lang="ts" setup>
import DownloadPanel from '~/components/video/DownloadPanel.vue'
import FloatingDownloadLauncher from '~/components/video/FloatingDownloadLauncher.vue'
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

const panelId = useId()
const closeButtonRef = useTemplateRef('closeButtonRef')
const toggleButtonRef = useTemplateRef('toggleButtonRef')

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
    :aria-label="i18n.t('extensionName')"
    class="pointer-events-none fixed inset-0 z-[2147483647] text-ink font-sans"
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
        class="max-h-[inherit] w-full of-y-auto border border-line rounded-2xl bg-white shadow-xl"
      >
        <header
          class="sticky top-0 z-1 flex items-center justify-between gap-3 border-b border-line bg-white px-5 py-4"
        >
          <div class="flex items-center gap-3">
            <AppIcon class="h-9 w-9" />
            <div>
              <h1 class="text-base font-bold">
                {{ i18n.t('downloadVideos') }}
              </h1>
              <p class="mt-1 text-xs text-muted">
                {{ i18n.t('extensionName') }}
              </p>
            </div>
          </div>
          <button
            @click="emit('close')"
            ref="closeButtonRef"
            :aria-label="i18n.t('closePanel')"
            type="button"
            class="h-8 w-8 xvd-secondary shrink-0 p-0 text-lg"
          >
            ×
          </button>
        </header>
        <DownloadPanel
          @refresh="emit('refresh')"
          @show-all="emit('showAll')"
          :snapshot
          :selected-post-id
        />
      </section>
    </FloatingDownloadLauncher>
  </aside>
</template>
