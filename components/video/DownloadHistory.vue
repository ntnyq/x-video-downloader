<script lang="ts" setup>
import { filterFalsy, orderBy, unique } from '@ntnyq/utils'
import { i18n } from '#i18n'
import DialogConfirm from '~/components/shared/DialogConfirm.vue'
import EmptyState from '~/components/shared/EmptyState.vue'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { usePostDownloads } from '~/composables/usePostDownloads'
import {
  filterDownloadHistory,
  isTerminalDownload,
} from '~/utils/downloadHistory'
import DownloadProgress from './DownloadProgress.vue'

const {
  downloads,
  isActionPending,
  message,
  requestError,
  progressError,
  action,
  clear,
} = usePostDownloads()
const clearOpen = shallowRef(false)
const clearIds = shallowRef<number[]>([])
const query = shallowRef('')
const author = shallowRef('')
const authorFilter = computed({
  get: () => (author.value ? `author:${author.value}` : 'all'),
  set(value: string) {
    author.value = value === 'all' ? '' : value.slice('author:'.length)
  },
})
const searchId = useId()
const authorId = useId()
const authors = computed(() =>
  orderBy(
    unique(filterFalsy(downloads.value.map(item => item.author))),
    author => author,
  ),
)
const filtered = computed(() =>
  filterDownloadHistory(downloads.value, query.value, author.value),
)
const terminalIds = computed(() =>
  filtered.value.filter(isTerminalDownload).map(item => item.id),
)

watch(clearOpen, value => {
  if (value) {
    clearIds.value = [...terminalIds.value]
  }
})

/**
 * Applies an owned-download action from a trusted interaction.
 */
function handleAction(
  id: number,
  operation: 'cancel' | 'retry' | 'pause' | 'resume',
  event: MouseEvent,
) {
  if (event.isTrusted) {
    action(id, operation)
  }
}

/**
 * Removes one history record after a trusted interaction.
 */
function handleRemove(id: number, event: MouseEvent) {
  if (event.isTrusted) {
    clear([id])
  }
}

/**
 * Clears only the finished records currently matching the visible filters.
 */
async function handleClear(event: MouseEvent) {
  if (event.isTrusted) {
    await clear(clearIds.value)
    if (!requestError.value) {
      clearOpen.value = false
    }
  }
}
</script>

<template>
  <section class="px-4 py-3 space-y-3">
    <div class="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-2">
      <Label
        :for="searchId"
        class="sr-only"
      >
        {{ i18n.t('searchDownloads') }}
      </Label>
      <Input
        v-model="query"
        :placeholder="i18n.t('historySearchPlaceholder')"
        :id="searchId"
        name="download-search"
        autocomplete="off"
        type="search"
        class="w-full text-xs"
      />
      <Label
        :for="authorId"
        class="sr-only"
      >
        {{ i18n.t('filterAuthor') }}
      </Label>
      <Select v-model="authorFilter">
        <SelectTrigger :id="authorId">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{{ i18n.t('allAuthors') }}</SelectItem>
          <SelectItem
            v-if="author && !authors.includes(author)"
            :value="`author:${author}`"
          >
            @{{ author }}
          </SelectItem>
          <SelectItem
            v-for="name in authors"
            :key="name"
            :value="`author:${name}`"
          >
            @{{ name }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs text-muted-foreground">
        {{ i18n.t('historyCount', [filtered.length]) }}
      </p>
      <DialogConfirm
        @confirm="handleClear"
        v-model:open="clearOpen"
        :title="i18n.t('clearFinished')"
        :description="i18n.t('historyClearHelp')"
        :disabled="isActionPending"
        :error="requestError"
      >
        <template #trigger>
          <Button
            :disabled="isActionPending || !terminalIds.length"
            variant="ghost"
            size="sm"
            class="text-xs text-muted-foreground"
            ><UiIcon name="trash" />{{ i18n.t('clearFinished') }}</Button
          >
        </template>
      </DialogConfirm>
    </div>
    <p
      v-if="requestError || progressError"
      role="alert"
      class="text-xs text-destructive"
    >
      {{ requestError || progressError }}
    </p>
    <p
      v-if="message"
      role="status"
      class="text-xs text-muted-foreground"
    >
      {{ message }}
    </p>
    <DownloadProgress
      @action="handleAction"
      @remove="handleRemove"
      :downloads="filtered"
      :disabled="isActionPending"
      show-post
      can-remove
    />
    <EmptyState
      v-if="!filtered.length && !progressError"
      :title="i18n.t(downloads.length ? 'historyNoMatches' : 'historyEmpty')"
    />
  </section>
</template>
