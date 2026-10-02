<script lang="ts" setup>
// import { useMagicKeys } from '@vueuse/core'
// import { Command as IconCommand } from 'lucide-vue-next'
// import { ref, watch } from 'vue'

// const isOpen = ref(false)

// const keys = useMagicKeys()
// const ctrlJ = keys['Ctrl+J']
// const metaJ = keys['Meta+J']

// watch([ctrlJ, metaJ], v => {
//   if (v[0] || v[1]) {
//     isOpen.value = !isOpen.value
//   }
// })
</script>

<template>
  <!--
    <main class="fixed bottom-[100px] right-0 bg-white shadow-sm">
    <VButton
    @click="isOpen = true"
    variant="default"
    >
    <IconCommand :size="18" />
    </VButton>
    <VCommand v-model="isOpen" />
    </main> 
  -->
  <div class="h-100px w-100px bg-red" />
</template>
