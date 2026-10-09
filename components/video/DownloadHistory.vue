<script lang="ts" setup>
import { unique } from '@ntnyq/utils'
import { i18n } from '#i18n'
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
  unique(
    downloads.value.flatMap(item => (item.author ? [item.author] : [])),
  ).sort(),
)
const filtered = computed(() =>
  filterDownloadHistory(downloads.value, query.value, author.value),
)
const terminalIds = computed(() =>
  filtered.value.filter(isTerminalDownload).map(item => item.id),
)

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
 * Clears only the finished records currently matching the visible filters.
 */
function handleClear(event: MouseEvent) {
  if (event.isTrusted) {
    clear(terminalIds.value)
  }
}
</script>

<template>
  <section class="px-5 pb-5 space-y-4">
    <div class="space-y-2">
      <Label
        :for="searchId"
        class="block text-xs font-semibold"
        >{{ i18n.t('searchDownloads') }}</Label
      >
      <Input
        v-model="query"
        :placeholder="i18n.t('historySearchPlaceholder')"
        :id="searchId"
        type="search"
        class="w-full"
      />
      <Label
        :for="authorId"
        class="block text-xs font-semibold"
        >{{ i18n.t('filterAuthor') }}</Label
      >
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
      <Button
        @click="handleClear"
        :disabled="isActionPending || !terminalIds.length"
        variant="link"
        type="button"
      >
        {{ i18n.t('clearFinished') }}
      </Button>
    </div>
    <p class="text-xs text-muted-foreground leading-relaxed">
      {{ i18n.t('historyClearHelp') }}
    </p>
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
      @remove="(id, event) => event.isTrusted && clear([id])"
      :downloads="filtered"
      :disabled="isActionPending"
      show-post
      can-remove
    />
    <p
      v-if="!filtered.length && !progressError"
      role="status"
      class="py-5 text-sm text-muted-foreground"
    >
      {{ i18n.t(downloads.length ? 'historyNoMatches' : 'historyEmpty') }}
    </p>
  </section>
</template>
