// @ts-check

import { defineESLintConfig } from '@ntnyq/eslint-config'

export default defineESLintConfig(
  {
    oxfmt: true,
    prettier: false,
    svgo: true,
    specials: {
      shadcnVue: {
        overrides: {
          'vue/no-props-shadow': 'off',
        },
      },
    },
    vue: {
      vuePerfectionist: {
        autoImport: true,
        vueuse: true,
        overrides: {
          'vue-perfectionist/prefer-define-model': 'off',
        },
      },
    },
  },
  {
    // Unknown JSON fields require bracket access with our strict tsconfig.
    files: ['**/*.ts'],
    rules: {
      'dot-notation': 'off',
    },
  },
)
