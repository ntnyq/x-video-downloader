<script lang="ts" setup>
import { i18n } from '#i18n'
import { browser } from '#imports'
import { Button } from '~/components/ui/button'
import { isRecord } from '~/utils/isRecord'

const props = defineProps<{
  broadcastId: string
}>()

const isPending = shallowRef(false)
const hasError = shallowRef(false)

async function openReplay(event: MouseEvent) {
  if (!event.isTrusted || isPending.value) {
    return
  }

  isPending.value = true
  hasError.value = false

  try {
    const res: unknown = await browser.runtime.sendMessage({
      type: 'open-broadcast-replay-v1',
      broadcastId: props.broadcastId,
    })

    const { ok } = isRecord(res) ? res : {}

    hasError.value = ok !== true
  } catch {
    hasError.value = true
  } finally {
    isPending.value = false
  }
}
</script>

<template>
  <Button
    @click="openReplay"
    :disabled="isPending"
    variant="outline"
    size="sm"
  >
    <UiIcon name="download" />
    {{ i18n.t('replay.download') }}
  </Button>
  <p
    v-if="hasError"
    role="alert"
    class="mt-2 text-xs text-destructive"
  >
    {{ i18n.t('replay.sourceUnavailable') }}
  </p>
</template>
