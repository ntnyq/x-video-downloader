<script lang="ts" setup>
import { i18n } from '#i18n'
import { Button } from '~/components/ui/button'
import { Toaster } from '~/components/ui/sonner'
import { provideOverlayTarget } from '~/composables/useOverlayTarget'
import { useTheme } from '~/composables/useTheme'
import DownloadSettings from './DownloadSettings.vue'
import ThemeSettings from './ThemeSettings.vue'

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
    class="min-h-screen bg-background px-5 py-10 text-foreground font-sans sm:px-6 sm:py-16"
  >
    <div class="mx-auto max-w-160">
      <AppIcon class="mb-8 h-16 w-16" />
      <h1 class="text-3xl font-bold">
        {{ welcome ? i18n.t('welcomeTitle') : i18n.t('extensionName') }}
      </h1>
      <p class="mb-8 mt-3 text-base text-muted-foreground">
        {{
          welcome ? i18n.t('welcomeDescription') : i18n.t('guideDescription')
        }}
      </p>
      <p class="mb-8 text-sm text-muted-foreground">
        {{ i18n.t('languageHelp') }}
      </p>
      <ThemeSettings />
      <DownloadSettings />
      <section class="py-8">
        <h2 class="mb-5 text-lg font-semibold">{{ i18n.t('guideSteps') }}</h2>
        <ol
          class="list-decimal pl-5 text-sm leading-relaxed space-y-4 marker:text-primary"
        >
          <li>{{ i18n.t('guideStepOne') }}</li>
          <li>
            {{ i18n.t('guideStepTwo') }}
          </li>
          <li>{{ i18n.t('guideStepThree') }}</li>
        </ol>
        <p class="mt-5 text-sm text-muted-foreground">
          {{ i18n.t('shortcutHelp') }}
        </p>
      </section>
      <section
        class="border-t border-border py-6 text-sm text-muted-foreground leading-relaxed space-y-3"
      >
        <h2 class="text-base text-foreground font-semibold">
          {{ i18n.t('troubleshootingTitle') }}
        </h2>
        <p>
          {{ i18n.t('troubleshootingHelp') }}
        </p>
        <p>
          {{ i18n.t('formatsHelp') }}
        </p>
        <p>
          {{ i18n.t('privacyHelp') }}
        </p>
      </section>
      <Button
        as="a"
        href="https://x.com"
        target="_blank"
        rel="noreferrer"
        >{{ i18n.t('openX') }}</Button
      >
    </div>
    <Toaster position="bottom-right" />
    <div ref="overlayRef" />
  </main>
</template>
