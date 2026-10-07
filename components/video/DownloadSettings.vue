<script lang="ts" setup>
import { useDownloadPreferences } from '~/composables/useDownloadPreferences'
import { normalizeQuality, QUALITY_OPTIONS } from '~/utils/preferences'
import {
  concurrencySetting,
  qualitySetting,
  saveAsSetting,
} from '~/utils/settings'
import FilenameSettings from './FilenameSettings.vue'

const { preferences, isReady, preferenceError } = useDownloadPreferences()

const isSaving = shallowRef(false)
const requestError = shallowRef('')
const statusMessage = shallowRef('')

/**
 * Persists a save-dialog or quality selection from its form control.
 * Storage failures restore the effective setting and show a localized error.
 *
 * @param event - Change event from the save-dialog checkbox or quality select.
 * @returns A promise resolving after the save attempt, or immediately for an unrelated target.
 */
async function updatePreference(event: Event) {
  const target = event.target
  if (
    !(target instanceof HTMLInputElement)
    && !(target instanceof HTMLSelectElement)
  ) {
    return
  }
  isSaving.value = true
  try {
    if (target instanceof HTMLInputElement) {
      await saveAsSetting.setValue(target.checked)
    } else if (target.id === 'download-concurrency') {
      await concurrencySetting.setValue(Number(target.value))
    } else {
      await qualitySetting.setValue(normalizeQuality(target.value))
    }
    requestError.value = ''
    statusMessage.value = i18n.t('preferencesSaved')
  } catch {
    if (target instanceof HTMLInputElement) {
      target.checked = preferences.value.saveAs
    } else if (target.id === 'download-concurrency') {
      target.value = String(preferences.value.concurrency)
    } else {
      target.value = preferences.value.quality
    }
    requestError.value = i18n.t('settingsSaveFailed')
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <section class="border-y border-line py-6 space-y-5">
    <h2 class="text-lg font-semibold">{{ i18n.t('downloadSettings') }}</h2>
    <div class="space-y-2">
      <label
        for="default-quality"
        class="block text-sm font-medium"
        >{{ i18n.t('defaultQuality') }}</label
      >
      <select
        @change="updatePreference"
        :value="preferences.quality"
        :disabled="!isReady || isSaving"
        id="default-quality"
        class="w-full xvd-input"
      >
        <option
          v-for="option in QUALITY_OPTIONS"
          :key="option.value"
          :value="option.value"
        >
          {{ i18n.t(option.label) }}
        </option>
      </select>
      <p class="text-xs text-muted leading-relaxed">
        {{ i18n.t('qualityHelp') }}
      </p>
    </div>
    <div class="space-y-2">
      <label
        for="download-concurrency"
        class="block text-sm font-medium"
        >{{ i18n.t('concurrentDownloads') }}</label
      >
      <select
        @change="updatePreference"
        :value="preferences.concurrency"
        :disabled="!isReady || isSaving"
        id="download-concurrency"
        class="w-full xvd-input"
      >
        <option
          v-for="count in 6"
          :key="count"
          :value="count"
        >
          {{ count }}
        </option>
      </select>
      <p class="text-xs text-muted leading-relaxed">
        {{ i18n.t('concurrencyHelp') }}
      </p>
    </div>
    <label class="flex cursor-pointer items-start gap-3">
      <input
        @change="updatePreference"
        :checked="preferences.saveAs"
        :disabled="!isReady || isSaving"
        type="checkbox"
        class="mt-1 h-4 w-4 accent-primary xvd-focus"
      />
      <span
        ><span class="block text-sm font-medium">{{
          i18n.t('chooseSaveLocation')
        }}</span
        ><span class="mt-1 block text-sm text-muted">{{
          i18n.t('saveLocationHelp')
        }}</span></span
      >
    </label>
    <p
      v-if="preferenceError || requestError || statusMessage"
      :class="preferenceError || requestError ? 'text-danger' : 'text-muted'"
      role="status"
      class="text-xs"
    >
      {{ preferenceError || requestError || statusMessage }}
    </p>
    <FilenameSettings
      :template="preferences.filenameTemplate"
      :disabled="!isReady"
    />
  </section>
</template>
