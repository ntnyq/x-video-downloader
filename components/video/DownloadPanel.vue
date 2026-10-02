<script lang="ts" setup>
import VideoPostCard from './VideoPostCard.vue'
import type { PageVideos } from '~/types/video'

defineProps<{
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
        class="xvd-link"
      >
        {{ i18n.t('refresh') }}
      </button>
    </div>
    <div
      v-if="
        snapshot.posts.some(
          post => !selectedPostId || post.id === selectedPostId,
        )
      "
    >
      <template
        v-for="post in snapshot.posts"
        :key="post.id"
      >
        <VideoPostCard
          v-if="!selectedPostId || post.id === selectedPostId"
          :post
        />
      </template>
    </div>
    <div
      v-else
      class="py-6"
    >
      <div
        class="mb-4 h-12 w-12 flex-center rounded-full bg-sky-50 text-2xl text-primary"
        aria-hidden="true"
      >
        ↓
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
