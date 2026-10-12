<script lang="ts" setup>
import {
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
  AlertDialogTrigger,
} from 'reka-ui'
import { i18n } from '#i18n'
import { Button } from '~/components/ui/button'
import { useOverlayTarget } from '~/composables/useOverlayTarget'
import type { VNode } from 'vue'

interface Props {
  /** Name of the pending operation. */
  title: string
  /** Scope and consequence of confirming. */
  description: string
  /** Disables confirmation while the request is pending. */
  disabled?: boolean
  /** Persistent failure feedback shown inside the modal. */
  error?: string
}
defineProps<Props>()
const emit = defineEmits<{
  confirm: [event: MouseEvent]
}>()
defineSlots<{
  trigger: () => VNode[]
}>()
const open = defineModel<boolean>('open', { default: false })
const overlayTarget = useOverlayTarget()
</script>

<template>
  <AlertDialogRoot v-model:open="open">
    <AlertDialogTrigger as-child><slot name="trigger" /></AlertDialogTrigger>
    <AlertDialogPortal
      :to="overlayTarget ?? undefined"
      :disabled="overlayTarget === null"
    >
      <AlertDialogOverlay
        class="pointer-events-auto fixed inset-0 z-50 bg-black/35"
      />
      <AlertDialogContent
        @keydown.esc.stop="open = false"
        :disable-outside-pointer-events="false"
        class="pointer-events-auto fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-96 max-h-[calc(100vh-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto border border-border rounded-xl bg-background p-5 text-foreground shadow-lg"
      >
        <AlertDialogTitle class="text-sm font-semibold">{{
          title
        }}</AlertDialogTitle>
        <AlertDialogDescription
          class="mt-3 text-xs text-muted-foreground leading-relaxed"
          >{{ description }}</AlertDialogDescription
        >
        <p
          v-if="error"
          role="alert"
          class="mt-3 text-xs text-destructive"
        >
          {{ error }}
        </p>
        <div class="mt-5 flex flex-wrap justify-end gap-2">
          <AlertDialogCancel as-child
            ><Button
              :disabled
              variant="outline"
              >{{ i18n.t('cancel') }}</Button
            ></AlertDialogCancel
          >
          <Button
            @click="emit('confirm', $event)"
            :disabled
            >{{ title }}</Button
          >
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
