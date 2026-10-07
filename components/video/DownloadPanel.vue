<script lang="ts" setup>
import PageVideoList from './PageVideoList.vue'
import type { PageVideos } from '~/types/video'

const props = defineProps<{
  /**
   * Captured videos and response-capture readiness for the current page.
   */
  snapshot: PageVideos
  /**
   * Post to focus when the panel was opened from an inline button.
   */
  selectedPostId?: string
}>()

const emit = defineEmits<{
  /**
   * Requests another capture replay and scan of the current page.
   */
  refresh: []
  /**
   * Clears the selected-post filter to show every captured post.
   */
  showAll: []
}>()
const visiblePosts = computed(() =>
  props.snapshot.posts.filter(
    post => !props.selectedPostId || post.id === props.selectedPostId,
  ),
)
</script>

<template>
  <div class="px-5 pb-3">
    <div class="flex items-center justify-between gap-3 py-3">
      <p class="text-xs text-muted">
        {{
          selectedPostId
            ? i18n.t('selectedPostVideos')
            : i18n.t('currentPageVideos')
        }}
      </p>
      <button
        @click="emit('showAll')"
        v-if="selectedPostId"
        type="button"
        class="xvd-link"
      >
        {{ i18n.t('showAll') }}
      </button>
      <button
        @click="emit('refresh')"
        v-else
        type="button"
        class="inline-flex xvd-link items-center gap-1.5"
      >
        <UiIcon
          name="refresh"
          class="h-3.5 w-3.5"
        />
        {{ i18n.t('refresh') }}
      </button>
    </div>
    <PageVideoList
      v-if="visiblePosts.length"
      :posts="visiblePosts"
    />
    <div
      v-else
      class="py-8"
    >
      <div
        class="mb-4 h-12 w-12 flex-center rounded-2xl bg-input text-ink"
        aria-hidden="true"
      >
        <UiIcon
          name="download"
          class="h-6 w-6"
        />
      </div>
      <h2 class="mb-2 text-base font-semibold">{{ i18n.t('noVideos') }}</h2>
      <p class="text-sm text-muted leading-relaxed">
        {{
          snapshot.captureReady
            ? i18n.t('noVideosReady')
            : i18n.t('noVideosReload')
        }}
      </p>
      <button
        @click="emit('refresh')"
        type="button"
        class="mt-4 xvd-secondary"
      >
        {{ i18n.t('refresh') }}
      </button>
    </div>
    <p class="border-t border-line py-3 text-xs text-muted leading-relaxed">
      {{ i18n.t('downloadNotice') }}
    </p>
  </div>
</template>
