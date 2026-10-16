<script lang="ts" setup>
import { i18n } from '#i18n'
import HelpDisclosure from '~/components/shared/HelpDisclosure.vue'
</script>

<template>
  <div class="py-6">
    <HelpDisclosure :title="i18n.t('guide.title')">
      <ol class="list-decimal pl-4 space-y-2">
        <li>{{ i18n.t('guide.stepOne') }}</li>
        <li>{{ i18n.t('guide.stepTwo') }}</li>
        <li>{{ i18n.t('guide.stepThree') }}</li>
      </ol>
      <p>{{ i18n.t('guide.shortcutHelp') }}</p>
      <p>{{ i18n.t('guide.troubleshootingHelp') }}</p>
      <p>{{ i18n.t('guide.formatsHelp') }}</p>
      <p>{{ i18n.t('guide.languageHelp') }}</p>
      <p>{{ i18n.t('guide.privacyHelp') }}</p>
      <p>{{ i18n.t('download.notice') }}</p>
    </HelpDisclosure>
  </div>
</template>
