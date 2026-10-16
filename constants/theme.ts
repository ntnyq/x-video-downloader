/**
 * Adaptive accent preset used when no supported theme is stored.
 */
export const DEFAULT_THEME = 'grok'

/**
 * Opaque fallback accent used for foreground contrast calculations.
 */
export const DEFAULT_THEME_COLOR = 'rgb(15, 20, 25)'

/**
 * Built-in accent palettes; Grok follows the light or dark surface automatically.
 */
export const THEME_PRESETS = [
  { color: DEFAULT_THEME_COLOR, id: DEFAULT_THEME, label: 'theme.grok' },
  { color: 'rgb(29, 155, 240)', id: 'blue', label: 'theme.blue' },
  { color: 'rgb(37, 99, 235)', id: 'ocean', label: 'theme.ocean' },
  { color: 'rgb(13, 148, 136)', id: 'teal', label: 'theme.teal' },
  { color: 'rgb(22, 163, 74)', id: 'green', label: 'theme.green' },
  { color: 'rgb(132, 204, 22)', id: 'lime', label: 'theme.lime' },
  { color: 'rgb(245, 158, 11)', id: 'amber', label: 'theme.amber' },
  { color: 'rgb(234, 88, 12)', id: 'orange', label: 'theme.orange' },
  { color: 'rgb(220, 38, 38)', id: 'red', label: 'theme.red' },
  { color: 'rgb(219, 39, 119)', id: 'rose', label: 'theme.rose' },
  { color: 'rgb(147, 51, 234)', id: 'purple', label: 'theme.purple' },
  { color: 'rgb(79, 70, 229)', id: 'indigo', label: 'theme.indigo' },
] as const

/**
 * Largest integer channel accepted for an opaque RGB color.
 */
export const MAX_RGB_CHANNEL = 255

/**
 * Background channel maximum above which the page is treated as light.
 */
export const PAGE_LIGHT_BRIGHTNESS_THRESHOLD = 128

/**
 * Background channel maximum above which a non-light page is treated as dim.
 */
export const PAGE_DIM_BRIGHTNESS_THRESHOLD = 20
