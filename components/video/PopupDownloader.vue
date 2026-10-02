<script lang="ts" setup>
import { browser } from '#imports'
import { useCurrentTabVideos } from '~/composables/useCurrentTabVideos'
import DownloadPanel from './DownloadPanel.vue'

const { snapshot, isLoading, requestError, refresh } = useCurrentTabVideos()
</script>

<template>
  <main
    class="max-h-600px min-h-280px w-360px of-y-auto bg-white text-ink font-sans"
  >
    <header
      class="flex items-center justify-between gap-3 border-b border-line px-5 py-4"
    >
      <div class="min-w-0 flex items-center gap-3">
        <AppIcon class="h-10 w-10" />
        <div class="min-w-0">
          <h1 class="text-lg font-bold">{{ i18n.t('extensionName') }}</h1>
          <p class="mt-1 text-xs text-muted">{{ i18n.t('popupTagline') }}</p>
        </div>
      </div>
      <button
        @click="browser.runtime.openOptionsPage()"
        type="button"
        class="shrink-0 xvd-link"
      >
        {{ i18n.t('settings') }}
      </button>
    </header>
    <p
      v-if="isLoading"
      role="status"
      class="p-5 text-sm text-muted"
    >
      {{ i18n.t('scanning') }}
    </p>
    <div
      v-else-if="requestError"
      class="p-5"
    >
      <p
        role="status"
        class="text-sm text-muted leading-relaxed"
      >
        {{ requestError }}
      </p>
      <a
        href="https://x.com"
        target="_blank"
        rel="noreferrer"
        class="mt-5 xvd-primary"
        >{{ i18n.t('openX') }}</a
      >
    </div>
    <DownloadPanel
      @refresh="refresh"
      v-else
      :snapshot
    />
  </main>
</template>
