<script lang="ts" setup>
import DownloadHistory from './DownloadHistory.vue'
import DownloadPanel from './DownloadPanel.vue'
import type { PageVideos } from '~/types/video'

interface Props {
  /**
   * Videos captured on the current page.
   */
  snapshot: PageVideos
  /**
   * Post selected by an inline download button.
   */
  selectedPostId?: string
  /**
   * Whether the popup is reading the current tab.
   */
  isLoading?: boolean
  /**
   * Current-tab access error; history remains independently available.
   */
  requestError?: string
}
const props = defineProps<Props>()
const emit = defineEmits<{
  /**
   * Refreshes page video detection.
   */
  refresh: []
  /**
   * Shows all captured posts.
   */
  showAll: []
}>()
const view = shallowRef<'videos' | 'history'>('videos')

watch(
  () => props.selectedPostId,
  () => {
    view.value = 'videos'
  },
)
</script>

<template>
  <nav
    :aria-label="i18n.t('downloadViews')"
    class="flex gap-2 px-5 py-3"
  >
    <button
      @click="view = 'videos'"
      :aria-pressed="view === 'videos'"
      :class="view === 'videos' ? 'xvd-primary' : 'xvd-secondary'"
      type="button"
    >
      {{ i18n.t('pageVideosTab') }}
    </button>
    <button
      @click="view = 'history'"
      :aria-pressed="view === 'history'"
      :class="view === 'history' ? 'xvd-primary' : 'xvd-secondary'"
      type="button"
    >
      {{ i18n.t('historyTab') }}
    </button>
  </nav>
  <DownloadHistory v-if="view === 'history'" />
  <p
    v-if="view === 'videos' && isLoading"
    role="status"
    class="p-5 text-sm text-muted"
  >
    {{ i18n.t('scanning') }}
  </p>
  <div
    v-else-if="view === 'videos' && requestError"
    class="p-5"
  >
    <p
      role="status"
      class="text-sm text-muted leading-relaxed"
    >
      {{ requestError }}
    </p>
    <a
      href="https://x.com"
      target="_blank"
      rel="noreferrer"
      class="mt-5 xvd-primary"
      >{{ i18n.t('openX') }}</a
    >
  </div>
  <DownloadPanel
    @refresh="emit('refresh')"
    @show-all="emit('showAll')"
    v-if="!isLoading && !requestError"
    v-show="view === 'videos'"
    :snapshot
    :selected-post-id
  />
</template>
