/**
 * Wxt config
 * @see {@link https://wxt.dev/api/config.html}
 */

import vueComponents from 'unplugin-vue-components/vite'
import { defineConfig } from 'wxt'
import { resolve } from './scripts/utils'

export default defineConfig({
  outDir: 'dist',

  autoIcons: {
    baseIconPath: 'assets/images/icon.png',
  },

  imports: {
    addons: {
      vueTemplate: true,
    },
    presets: [
      'vue',
      'pinia',
      'vue-router',
      {
        package: '@vueuse/core',
        ignore: [
          // exported from `vue`
          'toRef',
          'toRefs',
          'toValue',
          // exported from `wxt/storage`
          'useStorage',
        ],
      },
    ],
  },

  manifest: {
    default_locale: 'en',
    description: '__MSG_extensionDescription__',
    homepage_url: 'https://github.com/ntnyq/wxt-starter',
    host_permissions: [],
    name: '__MSG_extensionName__',
    optional_host_permissions: [],
    commands: {
      toggleExtension: {
        description: 'Activate or deactivate extension',
        suggested_key: {
          default: 'Alt+O',
        },
      },
    },
    optional_permissions: [
      // macOS requires `setting - Notifications`
      'notifications',
    ],
    permissions: [
      'storage',
      // Open tabs in background
      'activeTab',
      'tabs',
      'contextMenus',
    ],
  },

  modules: [
    '@wxt-dev/unocss',
    '@wxt-dev/auto-icons',
    '@wxt-dev/i18n/module',
    '@wxt-dev/module-vue',
  ],

  vite() {
    return {
      css: {
        devSourcemap: true,
      },

      optimizeDeps: {
        // https://github.com/vitejs/vite/discussions/13306
        entries: ['**/entrypoints/**/*.html'],
        exclude: ['uno.css'],
      },

      plugins: [
        vueComponents({
          dirs: [resolve('components')],
          dts: 'types/components.d.ts',
          resolvers: [],
        }),
      ],
    }
  },
})
