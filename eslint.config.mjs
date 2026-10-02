// @ts-check

import { defineESLintConfig } from '@ntnyq/eslint-config'

export default defineESLintConfig(
  { oxfmt: true, prettier: false, svgo: true },
  {
    // Unknown JSON fields require bracket access with our strict tsconfig.
    files: ['**/*.ts'],
    rules: { 'dot-notation': 'off' },
  },
)
