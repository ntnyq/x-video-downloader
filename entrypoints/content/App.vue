<script lang="ts" setup>
import DownloadPanel from '~/components/video/DownloadPanel.vue'
import type { PageVideos } from '~/types/video'

interface Props {
  /** Videos associated with posts on the current page. */
  snapshot: PageVideos
  /** Whether the floating panel is visible. */
  isOpen: boolean
  /** The inline button's selected post, if any. */
  selectedPostId?: string
}
const props = defineProps<Props>()
const emit = defineEmits<{ open: []; close: []; refresh: []; showAll: [] }>()
const videoCount = computed(() =>
  props.snapshot.posts.reduce((count, post) => count + post.media.length, 0),
)
const panelId = useId()
const closeButton = useTemplateRef('closeButton')
const toggleButton = useTemplateRef('toggleButton')

watch(
  () => props.isOpen,
  async value => {
    await nextTick()
    if (value) {
      closeButton.value?.focus()
    } else {
      toggleButton.value?.focus()
    }
  },
)
</script>

<template>
  <aside
    @keydown.esc.stop="emit('close')"
    :aria-label="i18n.t('extensionName')"
    class="fixed bottom-5 right-5 z-[2147483647] flex flex-col items-end gap-3 text-ink font-sans"
  >
    <section
      v-if="isOpen"
      :aria-label="i18n.t('panelOptions')"
      :id="panelId"
      class="max-h-[min(640px,75vh)] w-[min(360px,calc(100vw-40px))] of-y-auto border border-line rounded-2xl bg-white shadow-xl"
    >
      <header
        class="sticky top-0 z-1 flex items-center justify-between gap-3 border-b border-line bg-white px-5 py-4"
      >
        <div class="flex items-center gap-3">
          <AppIcon class="h-9 w-9" />
          <div>
            <h1 class="text-base font-bold">{{ i18n.t('downloadVideos') }}</h1>
            <p class="mt-1 text-xs text-muted">{{ i18n.t('extensionName') }}</p>
          </div>
        </div>
        <button
          @click="emit('close')"
          ref="closeButton"
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
    <button
      @click="isOpen ? emit('close') : emit('open')"
      ref="toggleButton"
      :aria-expanded="isOpen"
      :aria-controls="panelId"
      type="button"
      class="xvd-primary rounded-full px-5 shadow-lg"
    >
      <span
        aria-hidden="true"
        class="text-lg"
        >↓</span
      >
      {{ i18n.t('downloadVideos') }}
      <span
        v-if="videoCount"
        class="min-w-5 rounded-full bg-white/20 px-1.5 text-xs"
        >{{ videoCount }}</span
      >
    </button>
  </aside>
</template>
