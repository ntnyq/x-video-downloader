import { unique } from '@ntnyq/utils'
import {
  createDownloadRequest,
  selectPreferredVariant,
} from '~/utils/preferences'
import type { MaybeRefOrGetter } from 'vue'
import type { QualityPreference } from '~/types/download'
import type { VideoPost } from '~/types/video'

export function useVideoSelection(
  post: MaybeRefOrGetter<VideoPost>,
  quality: MaybeRefOrGetter<QualityPreference>,
) {
  const selectedUrls = shallowRef<Record<string, string>>({})
  const excludedIds = shallowRef<string[]>([])

  const rows = computed(() =>
    toValue(post).media.map((media, index) => ({
      media,
      index: index + 1,
      variant:
        media.variants.find(
          variant => variant.url === selectedUrls.value[media.id],
        ) ?? selectPreferredVariant(media.variants, toValue(quality)),
      checked:
        media.variants.length > 0 && !excludedIds.value.includes(media.id),
    })),
  )
  const downloadableCount = computed(
    () => rows.value.filter(row => row.variant).length,
  )
  const selectedCount = computed(
    () => rows.value.filter(row => row.checked).length,
  )
  const allSelected = computed(
    () =>
      downloadableCount.value > 0
      && downloadableCount.value === selectedCount.value,
  )

  /**
   * Stores a manual quality selection for one video.
   *
   * @param id - Identifier of the media entry within the current post.
   * @param url - Selected MP4 URL to prefer over the saved quality setting.
   */
  function setUrl(id: string, url: string) {
    selectedUrls.value = { ...selectedUrls.value, [id]: url }
  }

  /**
   * Includes or excludes one video from the batch selection.
   *
   * @param id - Identifier of the media entry to update.
   * @param checked - Whether the video should be included in the batch.
   */
  function setChecked(id: string, checked: boolean) {
    excludedIds.value = checked
      ? excludedIds.value.filter(value => value !== id)
      : unique([...excludedIds.value, id])
  }

  /**
   * Includes all downloadable videos or excludes every media entry in the post.
   *
   * @param checked - Whether all available videos should be selected.
   */
  function selectAll(checked: boolean) {
    excludedIds.value = checked
      ? []
      : toValue(post).media.map(media => media.id)
  }

  /**
   * Builds download requests for the selected batch or one specified media position.
   *
   * @param index - Optional one-based position; omitted to use the checked batch selection.
   * @param highest - Whether to override each chosen version with the highest quality.
   * @returns Requests for matching rows that have a downloadable MP4 version.
   */
  function requests(index?: number, highest = false) {
    return rows.value.flatMap(row => {
      if (index === undefined ? !row.checked : row.index !== index) {
        return []
      }
      const variant = highest
        ? selectPreferredVariant(row.media.variants, 'highest')
        : row.variant
      return variant
        ? [createDownloadRequest(toValue(post), row.index, variant)]
        : []
    })
  }

  watch(
    () => toValue(post).id,
    () => {
      selectedUrls.value = {}
      excludedIds.value = []
    },
  )

  return {
    rows,
    selectedCount,
    downloadableCount,
    allSelected,
    setUrl,
    setChecked,
    selectAll,
    requests,
  }
}
