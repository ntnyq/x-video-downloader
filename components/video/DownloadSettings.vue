<script lang="ts" setup>
import { toast } from 'vue-sonner'
import { i18n } from '#i18n'
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
import { logger } from '~/utils/logger'
import { normalizeQuality, QUALITY_OPTIONS } from '~/utils/preferences'
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
    toast.success(i18n.t('preferencesSaved'))
  } catch (error) {
    log.warn('Could not save download preferences', error)
    requestError.value = i18n.t('settingsSaveFailed')
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
  <section class="border-y border-border py-6 space-y-5">
    <h2 class="text-lg font-semibold">{{ i18n.t('downloadSettings') }}</h2>
    <div class="space-y-2">
      <Label
        for="default-quality"
        class="block text-sm font-medium"
        >{{ i18n.t('defaultQuality') }}</Label
      >
      <Select
        @update:model-value="updateQuality"
        :model-value="preferences.quality"
        :disabled="!isReady || isSaving"
      >
        <SelectTrigger
          id="default-quality"
          aria-describedby="default-quality-help"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="option in QUALITY_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ i18n.t(option.label) }}
          </SelectItem>
        </SelectContent>
      </Select>
      <p
        id="default-quality-help"
        class="text-xs text-muted-foreground leading-relaxed"
      >
        {{ i18n.t('qualityHelp') }}
      </p>
    </div>
    <div class="space-y-2">
      <Label
        for="download-concurrency"
        class="block text-sm font-medium"
        >{{ i18n.t('concurrentDownloads') }}</Label
      >
      <Select
        @update:model-value="updateConcurrency"
        :model-value="preferences.concurrency"
        :disabled="!isReady || isSaving"
      >
        <SelectTrigger
          id="download-concurrency"
          aria-describedby="download-concurrency-help"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="count in 6"
            :key="count"
            :value="count"
          >
            {{ count }}
          </SelectItem>
        </SelectContent>
      </Select>
      <p
        id="download-concurrency-help"
        class="text-xs text-muted-foreground leading-relaxed"
      >
        {{ i18n.t('concurrencyHelp') }}
      </p>
    </div>
    <div class="flex items-start gap-3">
      <Switch
        @update:model-value="updateSaveAs"
        :model-value="preferences.saveAs"
        :disabled="!isReady || isSaving"
        id="save-location"
        aria-describedby="save-location-help"
        class="mt-1"
      />
      <div>
        <Label
          for="save-location"
          class="block text-sm font-medium leading-relaxed"
          >{{ i18n.t('chooseSaveLocation') }}</Label
        >
        <p
          id="save-location-help"
          class="mt-1 text-sm text-muted-foreground"
        >
          {{ i18n.t('saveLocationHelp') }}
        </p>
      </div>
    </div>
    <p
      v-if="preferenceError || requestError"
      role="status"
      class="text-xs text-destructive"
    >
      {{ preferenceError || requestError }}
    </p>
    <FilenameSettings
      :template="preferences.filenameTemplate"
      :disabled="!isReady"
    />
  </section>
</template>
