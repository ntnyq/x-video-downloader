<script lang="ts" setup>
import { toast } from 'vue-sonner'
import { i18n } from '#i18n'
import HelpDisclosure from '~/components/shared/HelpDisclosure.vue'
import SettingsSection from '~/components/shared/SettingsSection.vue'
import { Label } from '~/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { Switch } from '~/components/ui/switch'
import { useDownloadPreferences } from '~/composables/useDownloadPreferences'
import { MAX_CONCURRENCY, QUALITY_OPTIONS } from '~/constants/preferences'
import { logger } from '~/utils/logger'
import { normalizeQuality } from '~/utils/preferences'
import {
  concurrencySetting,
  qualitySetting,
  saveAsSetting,
} from '~/utils/settings'
import FilenameSettings from './FilenameSettings.vue'

const { preferences, isReady, preferenceError } = useDownloadPreferences()

const log = logger.withTag('settings')

const isSaving = shallowRef(false)
const requestError = shallowRef('')

/**
 * Persists a setting while retaining the effective value when storage fails.
 */
async function savePreference(save: () => Promise<void>) {
  if (!isReady.value || isSaving.value) {
    return
  }
  isSaving.value = true
  requestError.value = ''
  try {
    await save()
    toast.success(i18n.t('settings.saved'))
  } catch (error) {
    log.warn('Could not save download preferences', error)
    requestError.value = i18n.t('settings.saveFailed')
  } finally {
    isSaving.value = false
  }
}

/**
 * Persists the immediate save-location preference.
 */
function updateSaveAs(value: boolean) {
  return savePreference(() => saveAsSetting.setValue(value))
}

/**
 * Retains the last persisted quality until storage confirms the new choice.
 */
function updateQuality(value: string) {
  return savePreference(() => qualitySetting.setValue(normalizeQuality(value)))
}

/**
 * Persists the numeric concurrency selected by the control.
 */
function updateConcurrency(value: number) {
  return savePreference(() => concurrencySetting.setValue(value))
}
</script>

<template>
  <SettingsSection
    :title="i18n.t('settings.downloads')"
    icon="download"
  >
    <div
      class="grid grid-cols-[minmax(0,1fr)_minmax(7rem,40%)] items-center gap-4"
    >
      <Label
        for="default-quality"
        class="text-sm"
        >{{ i18n.t('settings.defaultQuality') }}</Label
      >
      <Select
        @update:model-value="updateQuality"
        :model-value="preferences.quality"
        :disabled="!isReady || isSaving"
      >
        <SelectTrigger
          id="default-quality"
          class="text-xs"
          ><SelectValue
        /></SelectTrigger>
        <SelectContent
          ><SelectItem
            v-for="option in QUALITY_OPTIONS"
            :key="option.value"
            :value="option.value"
            >{{ i18n.t(option.label) }}</SelectItem
          ></SelectContent
        >
      </Select>
      <Label
        for="download-concurrency"
        class="text-sm"
        >{{ i18n.t('settings.concurrentDownloads') }}</Label
      >
      <Select
        @update:model-value="updateConcurrency"
        :model-value="preferences.concurrency"
        :disabled="!isReady || isSaving"
      >
        <SelectTrigger
          id="download-concurrency"
          class="text-xs"
          ><SelectValue
        /></SelectTrigger>
        <SelectContent
          ><SelectItem
            v-for="count in MAX_CONCURRENCY"
            :key="count"
            :value="count"
            >{{ count }}</SelectItem
          ></SelectContent
        >
      </Select>
      <Label
        for="save-location"
        class="text-sm leading-relaxed"
        >{{ i18n.t('settings.chooseSaveLocation') }}</Label
      >
      <Switch
        @update:model-value="updateSaveAs"
        :model-value="preferences.saveAs"
        :disabled="!isReady || isSaving"
        id="save-location"
        class="justify-self-end"
      />
    </div>
    <HelpDisclosure :title="i18n.t('settings.rules')"
      ><p>{{ i18n.t('settings.qualityHelp') }}</p>
      <p>{{ i18n.t('settings.concurrencyHelp') }}</p>
      <p>{{ i18n.t('settings.saveLocationHelp') }}</p></HelpDisclosure
    >
    <p
      v-if="preferenceError || requestError"
      role="alert"
      class="text-xs text-destructive"
    >
      {{ preferenceError || requestError }}
    </p>
  </SettingsSection>
  <FilenameSettings
    :template="preferences.filenameTemplate"
    :disabled="!isReady"
  />
</template>
