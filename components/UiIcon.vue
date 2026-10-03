<script lang="ts" setup>
defineProps<{
  /**
   * Shared action glyph rendered with the surrounding control's text color.
   */
  name: 'download' | 'close' | 'settings' | 'refresh' | 'check'
}>()

const paths = {
  download: 'M12 4v12m-5-5 5 5 5-5M5 17v3h14v-3',
  close: 'm6 6 12 12M6 18 18 6',
  settings: 'M4 7h9m4 0h3M4 17h3m4 0h9M13 4v6M7 14v6',
  refresh:
    'M20 7v5h-5M4 17v-5h5M6.1 7a7 7 0 0 1 11.6-2L20 8M4 16l2.3 3A7 7 0 0 0 18 17',
  check: 'm5 12 4 4L19 6',
}
</script>

<template>
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="pointer-events-none h-5 w-5 shrink-0"
  >
    <path :d="paths[name]" />
  </svg>
</template>
