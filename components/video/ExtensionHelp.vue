<script lang="ts" setup>
import { i18n } from '#i18n'
import HelpDisclosure from '~/components/shared/HelpDisclosure.vue'
</script>

<template>
  <div class="py-6">
    <HelpDisclosure :title="i18n.t('usageHelp')">
      <ol class="list-decimal pl-4 space-y-2">
        <li>{{ i18n.t('guideStepOne') }}</li>
        <li>{{ i18n.t('guideStepTwo') }}</li>
        <li>{{ i18n.t('guideStepThree') }}</li>
      </ol>
      <p>{{ i18n.t('shortcutHelp') }}</p>
      <p>{{ i18n.t('troubleshootingHelp') }}</p>
      <p>{{ i18n.t('formatsHelp') }}</p>
      <p>{{ i18n.t('languageHelp') }}</p>
      <p>{{ i18n.t('privacyHelp') }}</p>
      <p>{{ i18n.t('downloadNotice') }}</p>
    </HelpDisclosure>
  </div>
</template>
