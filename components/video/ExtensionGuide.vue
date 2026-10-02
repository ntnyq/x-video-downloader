<script lang="ts" setup>
import DownloadSettings from './DownloadSettings.vue'

defineProps<{ welcome?: boolean }>()
</script>

<template>
  <main class="min-h-screen bg-surface px-6 py-12 text-ink font-sans sm:py-20">
    <div class="mx-auto max-w-160">
      <AppIcon class="mb-8 h-16 w-16" />
      <h1 class="text-3xl font-bold">
        {{ welcome ? i18n.t('welcomeTitle') : i18n.t('extensionName') }}
      </h1>
      <p class="mb-8 mt-3 text-base text-muted">
        {{
          welcome ? i18n.t('welcomeDescription') : i18n.t('guideDescription')
        }}
      </p>
      <p class="mb-8 text-sm text-muted">{{ i18n.t('languageHelp') }}</p>
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
        <p class="mt-5 text-sm text-muted">
          {{ i18n.t('shortcutHelp') }}
        </p>
      </section>
      <section
        class="border-t border-line py-6 text-sm text-muted leading-relaxed space-y-3"
      >
        <h2 class="text-base text-ink font-semibold">
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
      <a
        href="https://x.com"
        target="_blank"
        rel="noreferrer"
        class="xvd-primary"
        >{{ i18n.t('openX') }}</a
      >
    </div>
  </main>
</template>
