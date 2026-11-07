<script lang="ts" setup>
import { i18n } from '#i18n'
import { Button } from '~/components/ui/button'
import ExtensionHelp from './ExtensionHelp.vue'

const { t } = i18n

const GUIDE_STEP_LIST = [
  'guide.stepOne',
  'guide.stepTwo',
  'guide.stepThree',
] as const
</script>

<template>
  <div class="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-20">
    <div class="grid items-center gap-12 md:grid-cols-2">
      <div>
        <p class="mb-5 flex items-center gap-2 text-xs text-muted-foreground">
          <UiIcon
            name="check"
            class="size-4"
          />{{ t('welcome.installed') }}
        </p>
        <h2 class="max-w-96 text-4xl font-semibold leading-tight sm:text-5xl">
          {{ t('welcome.title') }}
        </h2>
        <p class="mt-6 max-w-80 text-sm text-muted-foreground leading-relaxed">
          {{ t('welcome.description') }}
        </p>
        <Button
          as="a"
          href="https://x.com"
          target="_blank"
          rel="noreferrer"
          class="mt-7"
          >{{ t('common.openX') }}<UiIcon name="external"
        /></Button>
        <p
          class="mt-6 flex items-start gap-2 text-xs text-muted-foreground leading-relaxed"
        >
          <UiIcon
            name="keyboard"
            class="size-4"
          />{{ t('guide.shortcutHelp') }}
        </p>
      </div>
      <div
        :aria-label="t('welcome.example')"
        class="rounded-2xl border border-border p-5"
      >
        <div class="mb-4 flex items-center gap-3">
          <div
            class="flex size-9 items-center justify-center rounded-full bg-secondary font-semibold"
          >
            X
          </div>
          <span class="text-sm font-semibold">{{ t('welcome.example') }}</span>
        </div>
        <div
          class="flex aspect-video items-center justify-center rounded-lg bg-secondary text-muted-foreground"
        >
          <UiIcon
            name="play"
            class="size-8"
          />
        </div>
        <div
          class="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground"
        >
          <span>MP4</span
          ><span
            class="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-primary-foreground"
            ><UiIcon
              name="download"
              class="size-4"
            />{{ t('download.videos') }}</span
          >
        </div>
        <div class="mt-5 flex items-center gap-3 border-t border-border pt-4">
          <UiIcon name="file" />
          <div class="min-w-0 text-xs">
            <p class="truncate">video_1080p.mp4</p>
            <p class="mt-1 flex items-center gap-1 text-muted-foreground">
              <UiIcon
                name="check"
                class="size-3"
              />{{ t('download.state.complete') }}
            </p>
          </div>
        </div>
      </div>
    </div>
    <ol class="mt-14 grid gap-6 border-y border-border py-7 md:grid-cols-3">
      <li
        v-for="(key, index) in GUIDE_STEP_LIST"
        :key
        class="flex gap-3 text-xs leading-relaxed"
      >
        <span
          class="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-secondary"
          >{{ index + 1 }}</span
        >
        <p>{{ t(key) }}</p>
      </li>
    </ol>
    <ExtensionHelp />
  </div>
</template>
