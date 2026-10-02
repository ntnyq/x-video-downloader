<script lang="ts" setup>
import {
  buildFilename,
  DEFAULT_FILENAME_TEMPLATE,
  validateFilenameTemplate,
} from '~/utils/preferences'
import { filenameSetting } from '~/utils/settings'

const props = defineProps<{
  /**
   * Persisted filename template used to initialize and synchronize the draft.
   */
  template: string
  /**
   * Whether the parent settings view currently prevents saving.
   */
  disabled: boolean
}>()

const draft = shallowRef(props.template)
const isSaving = shallowRef(false)
const statusMessage = shallowRef('')
const saveError = shallowRef('')

const validationError = computed(() => validateFilenameTemplate(draft.value))
const preview = computed(() =>
  buildFilename(
    {
      type: 'download-video',
      postId: '2105974296740811141',
      mediaIndex: 1,
      author: 'ntnyq',
      createdAt: '2026-10-02T12:00:00.000Z',
      url: 'https://video.twimg.com/ext_tw_video/1/pu/vid/1920x1080/sample.mp4',
    },
    draft.value,
  ),
)

/**
 * Saves a trimmed filename template when validation and readiness allow it.
 * Storage failures are displayed in the form and always release the saving state.
 *
 * @returns A promise resolving after the save attempt, or immediately when saving is blocked.
 */
async function save() {
  if (validationError.value || props.disabled || isSaving.value) {
    return
  }
  isSaving.value = true
  try {
    await filenameSetting.setValue(draft.value.trim())
    statusMessage.value = i18n.t('templateSaved')
  } catch {
    saveError.value = i18n.t('templateSaveFailed')
  } finally {
    isSaving.value = false
  }
}

watch(
  () => props.template,
  value => {
    draft.value = value
  },
)
watch(draft, () => {
  statusMessage.value = ''
  saveError.value = ''
})
</script>

<template>
  <form
    @submit.prevent="save"
    class="border-t border-line pt-5 space-y-3"
  >
    <label
      for="filename-template"
      class="block text-sm font-medium"
      >{{ i18n.t('filenameTemplate') }}</label
    >
    <input
      v-model="draft"
      :disabled="disabled || isSaving"
      :aria-invalid="!!validationError"
      id="filename-template"
      aria-describedby="filename-help"
      maxlength="160"
      class="w-full xvd-input font-mono"
    />
    <p
      id="filename-help"
      class="text-xs text-muted leading-relaxed"
    >
      {{
        i18n.t('filenameHelp', [
          '{author}',
          '{date}',
          '{postId}',
          '{index}',
          '{quality}',
        ])
      }}
    </p>
    <p
      v-if="validationError"
      role="alert"
      class="text-xs text-red-700"
    >
      {{ i18n.t(validationError) }}
    </p>
    <div
      v-else
      class="rounded-lg bg-surface p-3 text-xs"
    >
      <p class="mb-1 text-muted">{{ i18n.t('filenamePreview') }}</p>
      <p class="break-all">{{ preview }}</p>
    </div>
    <div class="flex flex-wrap gap-3">
      <button
        :disabled="disabled || isSaving || !!validationError"
        type="submit"
        class="xvd-primary"
      >
        {{ isSaving ? i18n.t('saving') : i18n.t('saveTemplate') }}
      </button>
      <button
        @click="draft = DEFAULT_FILENAME_TEMPLATE"
        :disabled="disabled || isSaving"
        type="button"
        class="xvd-secondary"
      >
        {{ i18n.t('resetTemplate') }}
      </button>
    </div>
    <p
      v-if="statusMessage || saveError"
      :class="saveError ? 'text-red-700' : 'text-muted'"
      role="status"
      class="text-xs"
    >
      {{ saveError || statusMessage }}
    </p>
  </form>
</template>
