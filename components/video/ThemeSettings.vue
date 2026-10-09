<script lang="ts" setup>
import { toast } from 'vue-sonner'
import { i18n } from '#i18n'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { useTheme } from '~/composables/useTheme'
import {
  getThemeForeground,
  parseThemeColor,
  THEME_PRESETS,
} from '~/utils/theme'

const { theme, isReady, isSaving, themeError, saveTheme } = useTheme()

const draft = shallowRef('')

const parsedColor = computed(() => parseThemeColor(draft.value))
const isInvalid = computed(() => !!draft.value.trim() && !parsedColor.value)
const isDisabled = computed(() => !isReady.value || isSaving.value)

/**
 * Applies a color choice and announces successful persistence.
 *
 * @param value - Built-in identifier or validated RGB value.
 */
async function applyTheme(value: string) {
  if (await saveTheme(value)) {
    toast.success(i18n.t('themeSaved'))
  }
}

watch(
  theme,
  value => {
    draft.value = parseThemeColor(value) ?? ''
  },
  { immediate: true },
)
</script>

<template>
  <section
    class="border-t border-border py-6 space-y-5"
    aria-labelledby="theme-heading"
  >
    <div>
      <h2
        id="theme-heading"
        class="text-lg font-semibold"
      >
        {{ i18n.t('themeTitle') }}
      </h2>
      <p class="mt-2 text-sm text-muted-foreground leading-relaxed">
        {{ i18n.t('themeDescription') }}
      </p>
    </div>
    <div
      :aria-label="i18n.t('themePresets')"
      class="grid grid-cols-3 gap-2 sm:grid-cols-4"
      role="group"
    >
      <Button
        @click="applyTheme(preset.id)"
        v-for="preset in THEME_PRESETS"
        :key="preset.id"
        :disabled="isDisabled"
        :aria-pressed="theme === preset.id"
        :class="
          theme === preset.id
            ? 'border-foreground bg-control'
            : 'border-border bg-background hover:bg-secondary'
        "
        variant="outline"
        type="button"
        class="h-auto min-w-0 flex flex-col cursor-pointer items-center gap-2 border rounded-xl px-2 py-3 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span
          :style="{
            backgroundColor: preset.color,
            color: getThemeForeground(preset.color),
          }"
          class="h-8 w-8 flex items-center justify-center border border-black/10 rounded-full"
        >
          <UiIcon
            v-if="theme === preset.id"
            name="check"
          />
        </span>
        <span class="text-center">{{ i18n.t(preset.label) }}</span>
      </Button>
    </div>
    <form
      @submit.prevent="parsedColor && applyTheme(parsedColor)"
      class="space-y-2"
    >
      <Label
        for="theme-rgb"
        class="block text-sm font-medium"
        >{{ i18n.t('themeCustom') }}</Label
      >
      <div class="flex flex-wrap items-center gap-2">
        <Input
          v-model="draft"
          :disabled="isDisabled"
          :aria-invalid="isInvalid"
          id="theme-rgb"
          aria-describedby="theme-rgb-help theme-rgb-error"
          placeholder="rgb(29, 155, 240)"
          maxlength="40"
          autocomplete="off"
          spellcheck="false"
          class="min-w-0 flex-1 basis-44"
        />
        <Button
          :disabled="isDisabled || !parsedColor"
          type="submit"
        >
          {{ i18n.t('themeApply') }}
        </Button>
      </div>
      <p
        id="theme-rgb-help"
        class="text-xs text-muted-foreground leading-relaxed"
      >
        {{ i18n.t('themeRgbHelp') }}
      </p>
      <p
        id="theme-rgb-error"
        class="text-xs text-destructive"
        aria-live="polite"
      >
        {{ isInvalid ? i18n.t('themeInvalid') : '' }}
      </p>
      <div
        v-if="parsedColor"
        class="flex items-center gap-3 rounded-xl bg-secondary p-3"
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
        <span class="text-xs text-muted-foreground">{{
          i18n.t('themePreview')
        }}</span>
      </div>
    </form>
    <p
      v-if="themeError"
      class="text-xs text-destructive"
      role="status"
    >
      {{ themeError }}
    </p>
  </section>
</template>
