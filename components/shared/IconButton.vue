<script lang="ts" setup>
import { Button } from '~/components/ui/button'
import type { IconName } from '~/types/icon'

defineProps<{
  /** Accessible action name, also shown as a native tooltip. */
  label: string
  /** Icon identifying the action. */
  icon: IconName
}>()
const buttonRef = useTemplateRef('buttonRef')
defineExpose({
  /** Returns keyboard focus to the action. */
  focus() {
    buttonRef.value?.focus()
  },
})
</script>

<template>
  <Button
    ref="buttonRef"
    :aria-label="label"
    :title="label"
    variant="ghost"
    size="icon-sm"
    class="text-muted-foreground hover:text-foreground"
  >
    <UiIcon
      :name="icon"
      class="size-4"
    />
  </Button>
</template>
