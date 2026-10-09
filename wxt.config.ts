/**
 * Wxt config
 * @see {@link https://wxt.dev/api/config.html}
 */

import tailwindcss from '@tailwindcss/vite'
import vueComponents from 'unplugin-vue-components/vite'
import { defineConfig } from 'wxt'
import { resolve } from './scripts/utils'

export default defineConfig({
  manifestVersion: 3,
  outDir: 'dist',

  autoIcons: {
    baseIconPath: 'assets/images/downloader.svg',
  },

  imports: {
    addons: {
      vueTemplate: true,
    },
    presets: [
      'vue',
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

  modules: [
    '@wxt-dev/auto-icons',
    '@wxt-dev/i18n/module',
    '@wxt-dev/module-vue',
  ],

  manifest({ browser }) {
    return {
      ...(browser === 'firefox'
        ? {
            browser_specific_settings: {
              gecko: {
                data_collection_permissions: { required: ['none'] },
                id: 'x-video-downloader@ntnyq',
                strict_min_version: '140.0',
              },
            },
          }
        : { minimum_chrome_version: '111' }),
      default_locale: 'en',
      description: '__MSG_extensionDescription__',
      homepage_url: 'https://github.com/ntnyq/x-video-downloader',
      host_permissions: [],
      name: '__MSG_extensionName__',
      optional_host_permissions: [],
      permissions: ['storage', 'activeTab', 'downloads'],
      commands: {
        toggleExtension: {
          description: '__MSG_togglePanel__',
          suggested_key: {
            default: 'Alt+O',
          },
        },
      },
    }
  },

  vite() {
    return {
      css: {
        devSourcemap: true,
      },

      optimizeDeps: {
        // https://github.com/vitejs/vite/discussions/13306
        entries: ['**/entrypoints/**/*.html'],
      },

      plugins: [
        tailwindcss(),
        vueComponents({
          dirs: [resolve('components')],
          dts: 'types/components.d.ts',
          resolvers: [],
        }),
      ],
    }
  },
})
