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
        'focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-3',
      'xvd-icon':
        'xvd-focus flex-center h-9 w-9 shrink-0 border-0 rounded-full bg-transparent p-0 text-ink cursor-pointer hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed',
      'xvd-input':
        'xvd-focus min-h-11 min-w-0 border border-control-line rounded-xl bg-input px-3 py-2 text-sm text-ink disabled:opacity-60',
      'xvd-link':
        'xvd-focus text-xs text-ink font-semibold cursor-pointer hover:underline disabled:opacity-50 disabled:cursor-not-allowed',
      'xvd-primary':
        'xvd-focus inline-flex items-center justify-center gap-2 min-h-10 border-0 rounded-full bg-primary px-4 py-2 text-sm text-on-primary font-bold cursor-pointer hover:opacity-85 disabled:opacity-50 disabled:cursor-not-allowed',
      'xvd-secondary':
        'xvd-focus inline-flex items-center justify-center gap-2 min-h-9 border border-control-line rounded-full bg-background px-4 py-1.5 text-sm text-ink font-semibold cursor-pointer hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed',
    },
  ],

  theme: {
    colors: {
      background: 'var(--xvd-background, var(--xvd-default-background))',
      danger: 'var(--xvd-danger, var(--xvd-default-danger))',
      hover: 'var(--xvd-hover, var(--xvd-default-hover))',
      ink: 'var(--xvd-ink, var(--xvd-default-ink))',
      input: 'var(--xvd-input, var(--xvd-default-input))',
      line: 'var(--xvd-line, var(--xvd-default-line))',
      muted: 'var(--xvd-muted, var(--xvd-default-muted))',
      'on-primary': 'var(--xvd-on-accent, var(--xvd-theme-on-accent))',
      primary: 'var(--xvd-accent, var(--xvd-theme-accent))',
      surface: 'var(--xvd-surface, var(--xvd-default-surface))',
      'control-line':
        'var(--xvd-control-line, var(--xvd-default-control-line))',
    },
    fontFamily: {
      sans: 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
    },
  },
})
