<script lang="ts" setup>
import { i18n } from '#i18n'
import { browser } from '#imports'
import { CHANGELOG_ENTRIES } from '~/constants/changelog'

const currentVersion = browser.runtime.getManifest().version
const dateFormatter = new Intl.DateTimeFormat(i18n.t('extension.language'), {
  dateStyle: 'medium',
  timeZone: 'UTC',
})
const entries = CHANGELOG_ENTRIES.map(entry => ({
  ...entry,
  formattedDate: dateFormatter.format(new Date(`${entry.date}T00:00:00Z`)),
}))
</script>

<template>
  <div class="mx-auto max-w-170 px-5 py-8 sm:py-10">
    <h2 class="text-2xl font-semibold">{{ i18n.t('changelog.title') }}</h2>
    <p class="mt-3 text-sm text-muted-foreground leading-relaxed">
      {{ i18n.t('changelog.description') }}
    </p>
    <p class="mt-3 text-xs text-muted-foreground">
      {{ i18n.t('changelog.installedVersion', [currentVersion]) }}
    </p>
    <div class="mt-8 space-y-6">
      <section
        v-for="entry in entries"
        :key="entry.version"
        :aria-labelledby="`release-${entry.version}`"
        class="rounded-xl border border-border p-5 sm:p-6"
      >
        <div class="flex flex-wrap items-center gap-3">
          <h3
            :id="`release-${entry.version}`"
            class="text-lg font-semibold"
          >
            v{{ entry.version }}
          </h3>
          <span
            v-if="entry.version === currentVersion"
            class="rounded-full bg-secondary px-2 py-1 text-xs font-medium"
            >{{ i18n.t('changelog.currentVersion') }}</span
          >
          <time
            :datetime="entry.date"
            class="text-xs text-muted-foreground"
            >{{ entry.formattedDate }}</time
          >
        </div>
        <ul class="mt-5 space-y-4">
          <li
            v-for="change in entry.changes"
            :key="change.key"
            class="flex flex-col items-start gap-2 text-sm leading-relaxed sm:flex-row sm:gap-3"
          >
            <span
              class="shrink-0 rounded border border-border px-2 py-0.5 text-xs text-muted-foreground"
              >{{ i18n.t(change.type) }}</span
            >
            <span>{{ i18n.t(change.key) }}</span>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
