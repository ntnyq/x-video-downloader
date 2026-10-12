<script lang="ts" setup>
import { toast } from 'vue-sonner'
import { i18n } from '#i18n'
import HelpDisclosure from '~/components/shared/HelpDisclosure.vue'
import SettingsSection from '~/components/shared/SettingsSection.vue'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
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
const saveError = shallowRef('')
const savedTemplate = shallowRef(props.template)
const inputRef = useTemplateRef('inputRef')
const isDirty = computed(() => draft.value.trim() !== savedTemplate.value)
useEventListener(window, 'beforeunload', event => {
  if (isDirty.value) {
    event.preventDefault()
    event.returnValue = ''
  }
})

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
  if (validationError.value) {
    inputRef.value?.$el?.focus()
    return
  }
  if (props.disabled || isSaving.value) {
    return
  }
  isSaving.value = true
  saveError.value = ''
  try {
    await filenameSetting.setValue(draft.value.trim())
    savedTemplate.value = draft.value.trim()
    toast.success(i18n.t('templateSaved'))
  } catch {
    saveError.value = i18n.t('templateSaveFailed')
  } finally {
    isSaving.value = false
  }
}

watch(
  () => props.template,
  value => {
    if (!isDirty.value) {
      draft.value = value
    }
    savedTemplate.value = value
  },
)
watch(draft, () => {
  saveError.value = ''
})
</script>

<template>
  <SettingsSection
    :title="i18n.t('filenameTemplate')"
    icon="file"
  >
    <template #actions
      ><Button
        @click="draft = DEFAULT_FILENAME_TEMPLATE"
        :disabled="disabled || isSaving"
        variant="ghost"
        size="sm"
        class="text-xs text-muted-foreground"
        >{{ i18n.t('resetTemplate') }}</Button
      ></template
    >
    <form
      @submit.prevent="save"
      class="space-y-3"
    >
      <Input
        v-model="draft"
        ref="inputRef"
        :disabled="disabled || isSaving"
        :aria-invalid="!!validationError"
        :aria-label="i18n.t('filenameTemplate')"
        :spellcheck="false"
        id="filename-template"
        name="filename-template"
        aria-describedby="filename-help filename-error"
        maxlength="160"
        autocomplete="off"
        class="w-full font-mono text-xs"
      />
      <HelpDisclosure :title="i18n.t('filenameVariables')"
        ><p id="filename-help">
          {{
            i18n.t('filenameHelp', [
              '{author}',
              '{date}',
              '{postId}',
              '{index}',
              '{quality}',
            ])
          }}
        </p></HelpDisclosure
      >
      <p
        id="filename-error"
        role="alert"
        class="text-xs text-destructive"
      >
        {{ validationError ? i18n.t(validationError) : saveError }}
      </p>
      <div
        v-if="!validationError"
        class="flex items-start gap-2 rounded-lg bg-secondary p-3 text-xs text-muted-foreground"
      >
        <UiIcon
          name="file"
          class="size-4"
        />
        <p class="min-w-0 break-all">
          <span class="sr-only">{{ i18n.t('filenamePreview') }}: </span
          >{{ preview }}
        </p>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <span class="text-xs text-muted-foreground">{{
          i18n.t('filenameExtension')
        }}</span>
        <Button
          :disabled="disabled || isSaving || !isDirty"
          variant="outline"
          type="submit"
          size="sm"
          >{{ isSaving ? i18n.t('saving') : i18n.t('saveTemplate') }}</Button
        >
      </div>
    </form>
  </SettingsSection>
</template>
