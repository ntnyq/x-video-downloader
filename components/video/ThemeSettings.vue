<script lang="ts" setup>
import { useTheme } from '~/composables/useTheme'
import {
  getThemeForeground,
  parseThemeColor,
  THEME_PRESETS,
} from '~/utils/theme'

const { theme, isReady, isSaving, themeError, saveTheme } = useTheme()

const draft = shallowRef('')
const statusMessage = shallowRef('')

const parsedColor = computed(() => parseThemeColor(draft.value))
const isInvalid = computed(() => !!draft.value.trim() && !parsedColor.value)
const isDisabled = computed(() => !isReady.value || isSaving.value)

/**
 * Applies a color choice and announces successful persistence.
 *
 * @param value - Built-in identifier or validated RGB value.
 */
async function applyTheme(value: string) {
  statusMessage.value = ''
  if (await saveTheme(value)) {
    statusMessage.value = i18n.t('themeSaved')
  }
}

watch(
  theme,
  value => {
    draft.value = parseThemeColor(value) ?? ''
  },
  { immediate: true },
)
watch(draft, () => {
  statusMessage.value = ''
})
</script>

<template>
  <section
    class="border-t border-line py-6 space-y-5"
    aria-labelledby="theme-heading"
  >
    <div>
      <h2
        id="theme-heading"
        class="text-lg font-semibold"
      >
        {{ i18n.t('themeTitle') }}
      </h2>
      <p class="mt-2 text-sm text-muted leading-relaxed">
        {{ i18n.t('themeDescription') }}
      </p>
    </div>
    <div
      :aria-label="i18n.t('themePresets')"
      class="grid grid-cols-3 gap-2 sm:grid-cols-4"
      role="group"
    >
      <button
        @click="applyTheme(preset.id)"
        v-for="preset in THEME_PRESETS"
        :key="preset.id"
        :disabled="isDisabled"
        :aria-pressed="theme === preset.id"
        :class="
          theme === preset.id
            ? 'border-ink bg-input'
            : 'border-line bg-background hover:bg-surface'
        "
        type="button"
        class="min-w-0 flex flex-col cursor-pointer items-center gap-2 border rounded-xl px-2 py-3 text-xs text-ink xvd-focus disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span
          :style="{
            backgroundColor: preset.color,
            color: getThemeForeground(preset.color),
          }"
          class="h-8 w-8 flex-center border border-black/10 rounded-full"
        >
          <UiIcon
            v-if="theme === preset.id"
            name="check"
          />
        </span>
        <span class="text-center">{{ i18n.t(preset.label) }}</span>
      </button>
    </div>
    <form
      @submit.prevent="parsedColor && applyTheme(parsedColor)"
      class="space-y-2"
    >
      <label
        for="theme-rgb"
        class="block text-sm font-medium"
        >{{ i18n.t('themeCustom') }}</label
      >
      <div class="flex flex-wrap items-center gap-2">
        <input
          v-model="draft"
          :disabled="isDisabled"
          :aria-invalid="isInvalid"
          id="theme-rgb"
          aria-describedby="theme-rgb-help theme-rgb-error"
          placeholder="rgb(29, 155, 240)"
          maxlength="40"
          autocomplete="off"
          spellcheck="false"
          class="min-w-0 xvd-input flex-1 basis-44"
        />
        <button
          :disabled="isDisabled || !parsedColor"
          type="submit"
          class="xvd-primary"
        >
          {{ i18n.t('themeApply') }}
        </button>
      </div>
      <p
        id="theme-rgb-help"
        class="text-xs text-muted leading-relaxed"
      >
        {{ i18n.t('themeRgbHelp') }}
      </p>
      <p
        id="theme-rgb-error"
        class="text-xs text-danger"
        aria-live="polite"
      >
        {{ isInvalid ? i18n.t('themeInvalid') : '' }}
      </p>
      <div
        v-if="parsedColor"
        class="flex items-center gap-3 rounded-xl bg-surface p-3"
      >
        <span
          :style="{
            backgroundColor: parsedColor,
            color: getThemeForeground(parsedColor),
          }"
          class="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
        >
          <UiIcon name="download" />
          {{ i18n.t('downloadVideos') }}
        </span>
        <span class="text-xs text-muted">{{ i18n.t('themePreview') }}</span>
      </div>
    </form>
    <p
      v-if="themeError || statusMessage"
      :class="themeError ? 'text-danger' : 'text-muted'"
      class="text-xs"
      role="status"
    >
      {{ themeError || statusMessage }}
    </p>
  </section>
</template>
