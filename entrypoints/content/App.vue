<script lang="ts" setup>
import { browser } from '#imports'
import DownloadPanel from '~/components/video/DownloadPanel.vue'
import FloatingDownloadLauncher from '~/components/video/FloatingDownloadLauncher.vue'
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
const closeButtonRef = useTemplateRef('closeButtonRef')
const toggleButtonRef = useTemplateRef('toggleButtonRef')
const settingsError = shallowRef('')

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
    :style="themeStyle"
    :data-xvd-theme="pageTheme"
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
        class="xvd-panel-shadow max-h-[inherit] w-full of-y-auto overscroll-contain border border-line rounded-2xl bg-background"
      >
        <header
          class="sticky top-0 z-1 flex items-center justify-between gap-3 border-b border-line bg-background px-4 py-3"
        >
          <div class="min-w-0 flex items-center gap-3">
            <UiIcon
              name="download"
              class="h-6 w-6"
            />
            <div>
              <h1 class="text-base font-bold">
                {{ i18n.t('downloadVideos') }}
              </h1>
              <p class="mt-1 text-xs text-muted">
                {{ i18n.t('extensionName') }}
              </p>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <button
              @click="openSettings"
              :aria-label="i18n.t('settings')"
              :title="i18n.t('settings')"
              type="button"
              class="xvd-icon"
            >
              <UiIcon name="settings" />
            </button>
            <button
              @click="emit('close')"
              ref="closeButtonRef"
              :aria-label="i18n.t('closePanel')"
              type="button"
              class="xvd-icon"
            >
              <UiIcon name="close" />
            </button>
          </div>
        </header>
        <p
          v-if="settingsError"
          role="alert"
          class="px-5 pt-3 text-xs text-danger"
        >
          {{ settingsError }}
        </p>
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
