<script lang="ts" setup>
import { i18n } from '#i18n'
import { browser } from '#imports'
import { Button } from '~/components/ui/button'
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
    class="max-h-[600px] min-h-[280px] w-[360px] overflow-y-auto bg-background text-foreground font-sans"
  >
    <header
      class="sticky top-0 z-1 flex items-center justify-between gap-3 border-b border-border bg-background px-5 py-4"
    >
      <div class="min-w-0 flex items-center gap-3">
        <UiIcon
          name="download"
          class="h-6 w-6"
        />
        <div class="min-w-0">
          <h1 class="text-base font-bold">{{ i18n.t('extensionName') }}</h1>
          <p class="mt-1 text-xs text-muted-foreground">
            {{ i18n.t('popupTagline') }}
          </p>
        </div>
      </div>
      <Button
        @click="browser.runtime.openOptionsPage()"
        :aria-label="i18n.t('settings')"
        :title="i18n.t('settings')"
        variant="ghost"
        size="icon"
        type="button"
      >
        <UiIcon name="settings" />
      </Button>
    </header>
    <DownloadWorkspace
      @refresh="refresh"
      :snapshot
      :is-loading
      :request-error
    />
    <div ref="overlayRef" />
  </main>
</template>
