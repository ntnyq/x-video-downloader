<script lang="ts" setup>
import { i18n } from '#i18n'
import { browser } from '#imports'
import IconButton from '~/components/shared/IconButton.vue'
import SurfaceHeader from '~/components/shared/SurfaceHeader.vue'
import { useCurrentTabVideos } from '~/composables/useCurrentTabVideos'
import { provideOverlayTarget } from '~/composables/useOverlayTarget'
import { useTheme } from '~/composables/useTheme'
import DownloadWorkspace from './DownloadWorkspace.vue'

const { snapshot, isLoading, requestError, refresh } = useCurrentTabVideos()
const { themeStyle } = useTheme()
const overlayRef = useTemplateRef('overlayRef')
provideOverlayTarget(overlayRef)
</script>

<template>
  <!-- Keep width independent of the browser's auto-sized popup viewport. -->
  <main
    :style="themeStyle"
    class="h-[600px] w-[360px] flex flex-col overflow-hidden bg-background text-foreground font-sans"
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
      :snapshot
      :is-loading
      :request-error
    />
    <div ref="overlayRef" />
  </main>
</template>
