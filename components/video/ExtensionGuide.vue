<script lang="ts" setup>
import { i18n } from '#i18n'
import { browser } from '#imports'
import IconButton from '~/components/shared/IconButton.vue'
import SurfaceHeader from '~/components/shared/SurfaceHeader.vue'
import { Toaster } from '~/components/ui/sonner'
import { provideOverlayTarget } from '~/composables/useOverlayTarget'
import { useTheme } from '~/composables/useTheme'
import DownloadSettings from './DownloadSettings.vue'
import ExtensionHelp from './ExtensionHelp.vue'
import ThemeSettings from './ThemeSettings.vue'
import WelcomeGuide from './WelcomeGuide.vue'

defineProps<{
  /**
   * Whether to show the first-install introduction above the settings.
   */
  welcome?: boolean
}>()

const { themeStyle } = useTheme()
const overlayRef = useTemplateRef('overlayRef')
provideOverlayTarget(overlayRef)
</script>

<template>
  <main
    :style="themeStyle"
    class="min-h-screen bg-background text-foreground font-sans"
  >
    <SurfaceHeader
      :title="i18n.t('extensionName')"
      class="border-b border-border px-5 py-4 sm:px-8"
    >
      <IconButton
        @click="browser.runtime.openOptionsPage()"
        v-if="welcome"
        :label="i18n.t('settings')"
        icon="settings"
      />
      <a
        v-else
        :aria-label="i18n.t('usageHelp')"
        :title="i18n.t('usageHelp')"
        href="/welcome.html"
        class="flex size-8 items-center justify-center rounded-md text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
        ><UiIcon name="help"
      /></a>
    </SurfaceHeader>
    <WelcomeGuide v-if="welcome" />
    <div
      v-else
      class="mx-auto max-w-[584px] px-5 py-8 sm:py-10"
    >
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-2xl font-semibold">{{ i18n.t('settings') }}</h2>
        <span class="flex items-center gap-1 text-[11px] text-muted-foreground"
          ><UiIcon
            name="check"
            class="size-3"
          />{{ i18n.t('autoSavePreferences') }}</span
        >
      </div>
      <DownloadSettings />
      <ThemeSettings />
      <ExtensionHelp />
    </div>
    <Toaster position="bottom-right" />
    <div ref="overlayRef" />
  </main>
</template>
