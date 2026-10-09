<script lang="ts" setup>
import { i18n } from '#i18n'
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
  <Tabs v-model="view">
    <div class="px-5 py-3">
      <TabsList :aria-label="i18n.t('downloadViews')">
        <TabsTrigger value="videos">{{ i18n.t('pageVideosTab') }}</TabsTrigger>
        <TabsTrigger value="history">{{ i18n.t('historyTab') }}</TabsTrigger>
      </TabsList>
    </div>
    <TabsContent value="history">
      <DownloadHistory />
    </TabsContent>
    <TabsContent
      :hidden="view !== 'videos'"
      value="videos"
      force-mount
    >
      <p
        v-if="isLoading"
        role="status"
        class="p-5 text-sm text-muted-foreground"
      >
        {{ i18n.t('scanning') }}
      </p>
      <div
        v-else-if="requestError"
        class="p-5"
      >
        <p
          role="status"
          class="text-sm text-muted-foreground leading-relaxed"
        >
          {{ requestError }}
        </p>
        <Button
          as="a"
          href="https://x.com"
          target="_blank"
          rel="noreferrer"
          class="mt-5"
          >{{ i18n.t('openX') }}</Button
        >
      </div>
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
