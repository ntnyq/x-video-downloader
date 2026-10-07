import { MAX_DOWNLOAD_BATCH_SIZE } from '~/utils/download'
import {
  createSelectedVideoRequests,
  createVideoSelectionRows,
  setVideoSelectionChecked,
} from '~/utils/videoSelection'
import type { MaybeRefOrGetter } from 'vue'
import type { QualityPreference } from '~/types/download'
import type { VideoPost } from '~/types/video'
import type {
  VideoSelectionScope,
  VideoSelectionState,
} from '~/utils/videoSelection'

/**
 * Shares per-media quality and selection state between page and post actions.
 *
 * @param posts - Posts currently visible in the popup or content panel.
 * @param quality - Saved default quality, used until a row is manually changed.
 * @returns Derived selection summaries and explicit selection/download actions.
 */
export function usePageVideoSelection(
  posts: MaybeRefOrGetter<VideoPost[]>,
  quality: MaybeRefOrGetter<QualityPreference>,
) {
  const selection = shallowRef<VideoSelectionState>({
    selectedUrls: {},
    excludedKeys: [],
  })
  const rows = computed(() =>
    createVideoSelectionRows(toValue(posts), toValue(quality), selection.value),
  )
  const groups = computed(() =>
    toValue(posts).map(post => {
      const postRows = rows.value.filter(row => row.post.id === post.id)
      const downloadableCount = postRows.filter(row => row.variant).length
      const selectedCount = postRows.filter(row => row.checked).length
      return {
        post,
        rows: postRows,
        downloadableCount,
        selectedCount,
        allSelected:
          downloadableCount > 0 && downloadableCount === selectedCount,
      }
    }),
  )
  const downloadableCount = computed(
    () => rows.value.filter(row => row.variant).length,
  )
  const selectedCount = computed(
    () => rows.value.filter(row => row.checked).length,
  )
  const selectedPostCount = computed(
    () => groups.value.filter(group => group.selectedCount > 0).length,
  )
  const allSelected = computed(
    () =>
      downloadableCount.value > 0
      && downloadableCount.value === selectedCount.value,
  )
  const isOverLimit = computed(
    () => selectedCount.value > MAX_DOWNLOAD_BATCH_SIZE,
  )

  /**
   * Saves a per-media quality choice used by both post and page actions.
   *
   * @param key - Composite post and media identity of the changed row.
   * @param url - Selected MP4 URL belonging to that row.
   */
  function setUrl(key: string, url: string) {
    if (
      !rows.value.some(
        row =>
          row.key === key
          && row.media.variants.some(variant => variant.url === url),
      )
    ) {
      return
    }
    selection.value = {
      ...selection.value,
      selectedUrls: { ...selection.value.selectedUrls, [key]: url },
    }
  }

  /**
   * Updates a single row without affecting the other post selections.
   *
   * @param key - Composite post and media identity of the changed row.
   * @param checked - Whether the row belongs to the batch.
   */
  function setChecked(key: string, checked: boolean) {
    selection.value = setVideoSelectionChecked(selection.value, [key], checked)
  }

  /**
   * Changes every visible downloadable row, optionally limited to one post.
   *
   * @param checked - Whether matching rows should be selected.
   * @param postId - Optional post whose rows should change.
   */
  function selectAll(checked: boolean, postId?: string) {
    const keys = rows.value
      .filter(
        row => row.variant && (postId === undefined || row.post.id === postId),
      )
      .map(row => row.key)
    selection.value = setVideoSelectionChecked(selection.value, keys, checked)
  }

  /**
   * Resolves the shared selection into an untruncated download request list.
   *
   * @param scope - Optional post/media target and best-quality override.
   * @returns Selected requests, including all rows when the page exceeds the limit.
   */
  function requests(scope?: VideoSelectionScope) {
    return createSelectedVideoRequests(rows.value, scope)
  }

  return {
    groups,
    selectedCount,
    selectedPostCount,
    downloadableCount,
    allSelected,
    isOverLimit,
    setUrl,
    setChecked,
    selectAll,
    requests,
  }
}
