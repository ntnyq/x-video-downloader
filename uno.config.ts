import {
  defineConfig,
  presetIcons,
  presetWind3,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

export default defineConfig({
  transformers: [transformerDirectives(), transformerVariantGroup()],

  presets: [
    presetWind3(),
    presetIcons({
      autoInstall: true,
      scale: 1.2,
      extraProperties: {
        color: 'inherit',
        // Avoid crushing of icons in crowded situations
        'min-width': '1.2em',
      },
    }),
  ],

  shortcuts: [
    {
      'flex-center': 'flex justify-center items-center',
      'xvd-focus':
        'focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-3',
      'xvd-input':
        'xvd-focus min-h-10 border border-line rounded-lg bg-surface px-3 py-2 text-sm text-ink disabled:opacity-60',
      'xvd-link':
        'xvd-focus text-xs text-primary font-medium cursor-pointer hover:underline',
      'xvd-primary':
        'xvd-focus inline-flex items-center justify-center gap-2 min-h-10 border-0 rounded-lg bg-primary px-4 py-2 text-sm text-white font-semibold cursor-pointer hover:bg-blue-700 disabled:opacity-60 disabled:cursor-wait',
      'xvd-secondary':
        'xvd-focus inline-flex items-center justify-center gap-2 min-h-8 border border-line rounded-lg bg-white px-3 py-1.5 text-sm text-ink cursor-pointer hover:bg-sky-50',
    },
  ],

  theme: {
    colors: {
      ink: '#0f1419',
      line: '#d8e0e6',
      muted: '#536471',
      primary: '#0879be',
      surface: '#f7f9fa',
    },
  },
})
