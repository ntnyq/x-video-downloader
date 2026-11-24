<script lang="ts" setup>
import { i18n } from '#i18n'
import { browser } from '#imports'
import { Button } from '~/components/ui/button'
import { Label } from '~/components/ui/label'
import { useDownloadPreferences } from '~/composables/useDownloadPreferences'
import { useTheme } from '~/composables/useTheme'
import { QUALITY_OPTIONS } from '~/constants/preferences'
import { normalizeQuality } from '~/utils/download/preferences'
import { isRecord } from '~/utils/isRecord'
import { normalizeBroadcastReplay } from '~/utils/replay/broadcast'
import {
  ReplayFormatError,
  ReplayLimitError,
  ReplayStorageError,
  ReplayUnfinishedError,
} from '~/utils/replay/errors'
import {
  downloadReplay,
  ReplayBusyError,
  ReplayCancelledError,
  ReplayFetchError,
  ReplaySaveError,
  ReplaySegmentError,
  ReplayStalledError,
} from './downloadReplay'
import type { BroadcastReplay } from '~/utils/replay/broadcast'
import type {
  ReplayQualityPreference,
  ReplayRendition,
  ReplayRenditionRetry,
} from '~/utils/replay/playlist'
import type { ReplayProgress } from './downloadReplay'

const { themeStyle } = useTheme()
const { preferences, isReady, preferenceError } = useDownloadPreferences()

const replay = shallowRef<BroadcastReplay>()
const selectedQuality = shallowRef<ReplayQualityPreference>()
const activeRendition = shallowRef<ReplayRendition>()
const renditionRetry = shallowRef<ReplayRenditionRetry>()
const isLoading = shallowRef(true)
const controller = shallowRef<AbortController>()
const progress = shallowRef<
  ReplayProgress | { phase: 'complete' | 'cancelled' }
>()
const errorMessage = shallowRef('')

const replayHost = computed(() =>
  replay.value ? new URL(replay.value.playlist).hostname : '',
)
const quality = computed(
  () => selectedQuality.value ?? preferences.value.quality,
)
const progressLabel = computed(() => {
  const state = progress.value

  if (state?.phase === 'fetching') {
    return i18n.t('replay.fetching', [state.completed, state.total])
  }

  return state ? i18n.t(`replay.${state.phase}`) : ''
})

const lowerResolutions = ['480p', '360p']

function renditionLabel({ width, height, bitrate }: ReplayRendition) {
  const rate = i18n.t('replay.bitrate', [Math.round(bitrate / 1000)])

  return width && height ? `${width} × ${height} · ${rate}` : rate
}

async function loadReplay() {
  isLoading.value = true
  errorMessage.value = ''

  try {
    const response: unknown = await browser.runtime.sendMessage({
      type: 'get-broadcast-replay-v1',
    })

    const { ok, replay: captured } = isRecord(response) ? response : {}

    if (ok === true) {
      replay.value = normalizeBroadcastReplay(captured)
    }
  } catch {
    // Reloading the source tab can restore capture.
  } finally {
    isLoading.value = false

    if (!replay.value) {
      errorMessage.value = i18n.t('replay.sourceUnavailable')
    }
  }
}

function selectQuality(event: Event) {
  if (event.target instanceof HTMLSelectElement) {
    const value = event.target.value

    selectedQuality.value =
      value === '480p' || value === '360p' ? value : normalizeQuality(value)

    if (renditionRetry.value) {
      renditionRetry.value = undefined
      errorMessage.value = ''
      activeRendition.value = undefined
    }
  }
}

function cancel() {
  controller.value?.abort(new ReplayCancelledError())
}

async function startReplayDownload(
  event: MouseEvent,
  retry?: ReplayRenditionRetry,
) {
  const source = replay.value

  if (!event.isTrusted || !source || !isReady.value || controller.value) {
    return
  }

  errorMessage.value = ''
  progress.value = undefined
  activeRendition.value = undefined
  renditionRetry.value = undefined

  const abort = new AbortController()
  const selected = quality.value
  const settings = preferences.value

  controller.value = abort

  try {
    // The optional host permission request must run inside a user gesture.
    const granted = await browser.permissions.request({
      origins: [`https://${replayHost.value}/*`],
    })

    if (!granted) {
      errorMessage.value = i18n.t('replay.permissionDenied')

      return
    }

    abort.signal.throwIfAborted()
    await downloadReplay(
      source,
      selected,
      settings,
      abort.signal,
      state => {
        progress.value = state

        if (state.phase === 'fetching') {
          activeRendition.value = state.rendition
        }
      },
      retry,
    )
    progress.value = { phase: 'complete' }
  } catch (error) {
    const cause: unknown = abort.signal.aborted ? abort.signal.reason : error

    progress.value = undefined

    if (cause instanceof ReplayCancelledError) {
      progress.value = { phase: 'cancelled' }
    } else if (cause instanceof ReplayFormatError) {
      errorMessage.value = i18n.t('replay.unsupported')
    } else if (cause instanceof ReplayUnfinishedError) {
      errorMessage.value = i18n.t('replay.unfinished')
    } else if (cause instanceof ReplayLimitError) {
      errorMessage.value = i18n.t('replay.limit')
    } else if (cause instanceof ReplayStorageError) {
      errorMessage.value = i18n.t('replay.storage')
    } else if (cause instanceof ReplayStalledError) {
      errorMessage.value = i18n.t('replay.stalled')
    } else if (cause instanceof ReplayFetchError) {
      errorMessage.value = i18n.t('replay.fetchFailed')
    } else if (cause instanceof ReplaySegmentError) {
      errorMessage.value =
        cause.segment === undefined
          ? i18n.t('replay.unsupported')
          : i18n.t(
              retry && !cause.retry
                ? 'replay.renditionsFailed'
                : 'replay.segmentFailed',
              [cause.segment],
            )
      renditionRetry.value = cause.retry
    } else if (cause instanceof ReplaySaveError) {
      errorMessage.value = i18n.t('replay.saveFailed')
    } else if (cause instanceof ReplayBusyError) {
      errorMessage.value = i18n.t('replay.busy')
    } else {
      errorMessage.value = i18n.t('replay.failed')
    }
  } finally {
    controller.value = undefined
  }
}

onMounted(async () => {
  await loadReplay()
})
useEventListener(window, 'pagehide', cancel)
</script>

<template>
  <main
    :style="themeStyle"
    class="min-h-screen bg-background px-4 py-8 text-foreground font-sans sm:py-14"
  >
    <section
      class="mx-auto max-w-lg space-y-5 rounded-xl border border-border bg-card p-5 sm:p-7"
    >
      <header class="space-y-2">
        <h1 class="text-xl font-semibold">
          {{ i18n.t('replay.title') }}
        </h1>
        <a
          v-if="replay"
          :href="`https://x.com/i/broadcasts/${replay.post.broadcastId}`"
          target="_blank"
          rel="noreferrer"
          class="block break-words text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          {{ replay.post.text || replay.post.broadcastId }}
        </a>
      </header>
      <p
        v-if="isLoading"
        role="status"
        class="text-sm text-muted-foreground"
      >
        {{ i18n.t('replay.validating') }}
      </p>
      <template v-if="replay">
        <p class="text-sm text-muted-foreground">
          {{ i18n.t('replay.instructions', [replayHost]) }}
        </p>
        <div class="grid gap-2">
          <Label for="replay-quality">{{ i18n.t('replay.quality') }}</Label>
          <select
            @change="selectQuality"
            :value="quality"
            :disabled="!!controller"
            id="replay-quality"
            class="min-h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option
              v-for="option in QUALITY_OPTIONS"
              :key="option.value"
              :value="option.value"
            >
              {{ i18n.t(option.label) }}
            </option>
            <option
              v-for="resolution in lowerResolutions"
              :key="resolution"
              :value="resolution"
            >
              {{ i18n.t('replay.preferResolution', [resolution]) }}
            </option>
          </select>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button
            @click="startReplayDownload"
            :disabled="!!controller || !isReady"
          >
            <UiIcon name="download" />
            {{ i18n.t('replay.download') }}
          </Button>
          <Button
            @click="cancel"
            v-if="controller"
            variant="outline"
          >
            {{ i18n.t('common.cancel') }}
          </Button>
        </div>
        <progress
          v-if="progress?.phase === 'fetching'"
          :value="progress.completed"
          :max="progress.total"
          :aria-label="progressLabel"
          class="h-2 w-full accent-primary"
        />
        <p
          v-if="activeRendition"
          class="text-sm text-muted-foreground"
        >
          {{
            i18n.t('replay.actualQuality', [renditionLabel(activeRendition)])
          }}
        </p>
        <p
          v-if="progressLabel"
          role="status"
          class="text-sm text-muted-foreground"
        >
          {{ progressLabel }}
        </p>
      </template>
      <p
        v-if="errorMessage || preferenceError"
        role="alert"
        class="text-sm text-destructive"
      >
        {{ errorMessage || preferenceError }}
      </p>
      <Button
        @click="startReplayDownload($event, renditionRetry)"
        v-if="renditionRetry"
        variant="outline"
      >
        {{
          i18n.t('replay.tryRendition', [
            renditionLabel(renditionRetry.rendition),
          ])
        }}
      </Button>
      <Button
        @click="loadReplay"
        v-if="!isLoading && !replay"
        variant="outline"
      >
        {{ i18n.t('common.refresh') }}
      </Button>
    </section>
  </main>
</template>
