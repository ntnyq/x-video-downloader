<script lang="ts" setup>
import { i18n } from '#i18n'
import { browser } from '#imports'
import IconButton from '~/components/shared/IconButton.vue'
import SurfaceHeader from '~/components/shared/SurfaceHeader.vue'
import { useCurrentTabVideos } from '~/composables/useCurrentTabVideos'
import { provideOverlayTarget } from '~/composables/useOverlayTarget'
import { useTheme } from '~/composables/useTheme'
import DownloadWorkspace from './DownloadWorkspace.vue'

const {
  snapshot,
  isLoading,
  requestError,
  isDisconnected,
  refresh,
  reloadTab,
} = useCurrentTabVideos()
const { themeStyle } = useTheme()

const overlayRef = useTemplateRef('overlayRef')

provideOverlayTarget(overlayRef)
</script>

<template>
  <main
    :style="themeStyle"
    class="h-full max-h-dvh w-full max-w-[100vw] flex flex-col overflow-hidden bg-background text-foreground font-sans"
  >
    <SurfaceHeader :title="i18n.t('extension.name')">
      <IconButton
        @click="browser.runtime.openOptionsPage()"
        :label="i18n.t('common.settings')"
        icon="settings"
      />
    </SurfaceHeader>
    <DownloadWorkspace
      @refresh="refresh"
      @reload-tab="reloadTab"
      :snapshot
      :is-loading
      :request-error
      :can-reload-tab="isDisconnected"
    />
    <div ref="overlayRef" />
  </main>
</template>
