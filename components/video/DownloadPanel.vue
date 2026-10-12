<script lang="ts" setup>
import { i18n } from '#i18n'
import EmptyState from '~/components/shared/EmptyState.vue'
import IconButton from '~/components/shared/IconButton.vue'
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
  <div class="min-h-0 flex flex-1 flex-col">
    <div
      v-if="selectedPostId"
      class="shrink-0 px-4 pt-2"
    >
      <Button
        @click="emit('showAll')"
        variant="ghost"
        size="sm"
        class="text-xs text-muted-foreground"
        ><UiIcon name="back" />{{ i18n.t('showAll') }}</Button
      >
    </div>
    <PageVideoList
      v-if="visiblePosts.length"
      :posts="visiblePosts"
      :single-post="!!selectedPostId"
    >
      <template #tools
        ><IconButton
          @click="emit('refresh')"
          :label="i18n.t('refresh')"
          icon="refresh"
      /></template>
    </PageVideoList>
    <EmptyState
      v-else
      :title="i18n.t('noVideos')"
      :description="
        snapshot.captureReady
          ? i18n.t('noVideosReady')
          : i18n.t('noVideosReload')
      "
    >
      <Button
        @click="emit('refresh')"
        variant="outline"
        size="sm"
        ><UiIcon name="refresh" />{{ i18n.t('refresh') }}</Button
      >
    </EmptyState>
  </div>
</template>
