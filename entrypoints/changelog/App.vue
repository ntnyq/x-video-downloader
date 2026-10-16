<script lang="ts" setup>
import { i18n } from '#i18n'
import ReleaseHistory from '~/components/changelog/ReleaseHistory.vue'
import SurfaceHeader from '~/components/shared/SurfaceHeader.vue'
import { Button } from '~/components/ui/button'
import { useTheme } from '~/composables/useTheme'

const { themeStyle } = useTheme()
</script>

<template>
  <main
    :style="themeStyle"
    class="min-h-screen bg-background text-foreground font-sans"
  >
    <SurfaceHeader
      :title="i18n.t('extension.name')"
      class="border-b border-border px-5 py-4 sm:px-8"
    >
      <Button
        as="a"
        href="/options.html"
        variant="outline"
        size="sm"
      >
        <UiIcon name="settings" />
        {{ i18n.t('common.settings') }}
      </Button>
    </SurfaceHeader>
    <ReleaseHistory />
  </main>
</template>
