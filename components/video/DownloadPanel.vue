<script lang="ts" setup>
import { i18n } from '#i18n'
import { Button } from '~/components/ui/button'
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
      <p class="text-xs text-muted-foreground">
        {{
          selectedPostId
            ? i18n.t('selectedPostVideos')
            : i18n.t('currentPageVideos')
        }}
      </p>
      <Button
        @click="emit('showAll')"
        v-if="selectedPostId"
        variant="link"
        type="button"
      >
        {{ i18n.t('showAll') }}
      </Button>
      <Button
        @click="emit('refresh')"
        v-else
        variant="link"
        type="button"
        class="inline-flex items-center gap-1.5"
      >
        <UiIcon
          name="refresh"
          class="h-3.5 w-3.5"
        />
        {{ i18n.t('refresh') }}
      </Button>
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
        class="mb-4 h-12 w-12 flex items-center justify-center rounded-2xl bg-secondary text-foreground"
        aria-hidden="true"
      >
        <UiIcon
          name="download"
          class="h-6 w-6"
        />
      </div>
      <h2 class="mb-2 text-base font-semibold">{{ i18n.t('noVideos') }}</h2>
      <p class="text-sm text-muted-foreground leading-relaxed">
        {{
          snapshot.captureReady
            ? i18n.t('noVideosReady')
            : i18n.t('noVideosReload')
        }}
      </p>
      <Button
        @click="emit('refresh')"
        variant="outline"
        type="button"
        class="mt-4"
      >
        {{ i18n.t('refresh') }}
      </Button>
    </div>
    <p
      class="border-t border-border py-3 text-xs text-muted-foreground leading-relaxed"
    >
      {{ i18n.t('downloadNotice') }}
    </p>
  </div>
</template>
