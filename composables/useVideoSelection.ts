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

  function setUrl(id: string, url: string) {
    selectedUrls.value = { ...selectedUrls.value, [id]: url }
  }
  function setChecked(id: string, checked: boolean) {
    excludedIds.value = checked
      ? excludedIds.value.filter(value => value !== id)
      : unique([...excludedIds.value, id])
  }
  function selectAll(checked: boolean) {
    excludedIds.value = checked
      ? []
      : toValue(post).media.map(media => media.id)
  }
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
