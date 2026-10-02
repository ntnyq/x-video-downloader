<script lang="ts" setup>
import {
  captureTabScreen,
  createNewTab,
  getActiveTab,
  openPopupWindow,
  showNotification,
} from '~/utils/browser'
import { logger } from '~/utils/logger'

function handleNotification() {
  showNotification({ message: '测试消息' })
}
function handleOpenNewTab() {
  createNewTab()
}
async function handleGetActiveTab() {
  logger.success(await getActiveTab())
}
function handleCaptureScreen() {
  captureTabScreen()
}
function handleOpenPopup() {
  openPopupWindow()
}
</script>

<template>
  <div class="relative mx-auto max-w-4xl flex-center p-8">
    <div class="flex flex-wrap gap-8">
      <button
        @click="handleNotification"
        type="button"
        class="flex-center rounded-md bg-blue px-4 py-3 text-lg text-white hover:op-80"
        role="button"
      >
        发送消息
      </button>
      <button
        @click="handleOpenNewTab"
        type="button"
        class="flex-center rounded-md bg-blue px-4 py-3 text-lg text-white hover:op-80"
        role="button"
      >
        新标签页
      </button>
      <button
        @click="handleGetActiveTab"
        type="button"
        class="flex-center rounded-md bg-blue px-4 py-3 text-lg text-white hover:op-80"
        role="button"
      >
        当前Tab
      </button>
      <button
        @click="handleCaptureScreen"
        type="button"
        class="flex-center rounded-md bg-blue px-4 py-3 text-lg text-white hover:op-80"
        role="button"
      >
        点击截图
      </button>
      <button
        @click="handleOpenPopup"
        type="button"
        class="flex-center rounded-md bg-blue px-4 py-3 text-lg text-white hover:op-80"
        role="button"
      >
        打开Popup
      </button>
    </div>
  </div>
</template>
