<script lang="ts" setup>
import { i18n } from '#i18n'
import EmptyState from '~/components/shared/EmptyState.vue'
import { Button } from '~/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
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
  /**
   * Whether the popup can reconnect by reloading the selected X tab.
   */
  canReloadTab?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  /**
   * Refreshes page video detection.
   */
  refresh: []
  /** Reloads the selected X tab. */
  reloadTab: []
  /**
   * Shows all captured posts.
   */
  showAll: []
}>()

const view = shallowRef<'videos' | 'history'>('videos')

const mediaCount = computed(() =>
  props.snapshot.posts.reduce(
    (count, post) => count + (post.broadcastId ? 1 : post.media.length),
    0,
  ),
)

watch(
  () => props.selectedPostId,
  () => {
    view.value = 'videos'
  },
)
</script>

<template>
  <Tabs
    v-model="view"
    class="min-h-0 flex-1"
  >
    <div class="shrink-0 border-b border-border px-4">
      <TabsList :aria-label="i18n.t('panel.views')">
        <TabsTrigger value="videos"
          ><UiIcon
            name="video"
            class="size-4"
          />{{ i18n.t('page.tab')
          }}<span class="rounded bg-secondary px-1.5 text-xs tabular-nums">{{
            mediaCount
          }}</span></TabsTrigger
        >
        <TabsTrigger value="history">
          <UiIcon
            name="history"
            class="size-4"
          />{{ i18n.t('history.tab') }}</TabsTrigger
        >
      </TabsList>
    </div>
    <TabsContent
      value="history"
      class="min-h-0 overflow-y-auto"
    >
      <DownloadHistory />
    </TabsContent>
    <TabsContent
      :hidden="view !== 'videos'"
      value="videos"
      class="min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col"
      force-mount
    >
      <EmptyState
        v-if="isLoading"
        :title="i18n.t('page.scanning')"
      />
      <EmptyState
        v-else-if="requestError"
        :title="i18n.t('page.connectionUnavailable')"
        :description="requestError"
      >
        <Button
          @click="emit('reloadTab')"
          v-if="canReloadTab"
        >
          {{ i18n.t('page.reloadTab') }}
        </Button>
        <Button
          v-else
          as="a"
          href="https://x.com"
          target="_blank"
          rel="noreferrer"
        >
          {{ i18n.t('common.openX') }}
        </Button>
      </EmptyState>
      <DownloadPanel
        @refresh="emit('refresh')"
        @show-all="emit('showAll')"
        v-else
        :snapshot
        :selected-post-id
      />
    </TabsContent>
  </Tabs>
</template>
