<script lang="ts" setup>
import { i18n } from '#i18n'
</script>

<template>
  <main
    class="relative max-h-600px min-h-240px w-320px flex-center of-y-auto p-4"
  >
    <h1 class="text-3xl text-primary font-semibold">
      {{ i18n.t('extensionName') }}
    </h1>
  </main>
</template>
