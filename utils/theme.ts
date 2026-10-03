/**
 * Built-in accent palettes; Grok follows the light or dark surface automatically.
 */
export const THEME_PRESETS = [
  { id: 'grok', label: 'themeGrok', color: 'rgb(15, 20, 25)' },
  { id: 'blue', label: 'themeBlue', color: 'rgb(29, 155, 240)' },
  { id: 'ocean', label: 'themeOcean', color: 'rgb(37, 99, 235)' },
  { id: 'teal', label: 'themeTeal', color: 'rgb(13, 148, 136)' },
  { id: 'green', label: 'themeGreen', color: 'rgb(22, 163, 74)' },
  { id: 'lime', label: 'themeLime', color: 'rgb(132, 204, 22)' },
  { id: 'amber', label: 'themeAmber', color: 'rgb(245, 158, 11)' },
  { id: 'orange', label: 'themeOrange', color: 'rgb(234, 88, 12)' },
  { id: 'red', label: 'themeRed', color: 'rgb(220, 38, 38)' },
  { id: 'rose', label: 'themeRose', color: 'rgb(219, 39, 119)' },
  { id: 'purple', label: 'themePurple', color: 'rgb(147, 51, 234)' },
  { id: 'indigo', label: 'themeIndigo', color: 'rgb(79, 70, 229)' },
] as const

/**
 * Parses opaque RGB colors with integer channels, rejecting CSS expressions and alpha.
 *
 * @param value - User input in rgb(r, g, b), rgb(r g b), or r, g, b form.
 * @returns Canonical RGB CSS, or undefined when a channel or syntax is invalid.
 */
export function parseThemeColor(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const input = value.trim()
  const body = /^rgb\((.*)\)$/i.exec(input)?.[1] ?? input
  const match =
    /^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/.exec(body.trim())
    ?? /^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})$/.exec(body.trim())
  if (!match) {
    return undefined
  }
  const channels = match.slice(1).map(Number)
  if (channels.some(channel => channel > 255)) {
    return undefined
  }
  return `rgb(${channels.join(', ')})`
}

/**
 * Normalizes stored palette identifiers and custom colors, defaulting to Grok.
 *
 * @param value - Untrusted extension storage value.
 * @returns A known preset identifier or validated opaque RGB color.
 */
export function normalizeTheme(value: unknown): string {
  return (
    THEME_PRESETS.find(preset => preset.id === value)?.id
    ?? parseThemeColor(value)
    ?? 'grok'
  )
}

/**
 * Chooses black or white text using WCAG relative luminance for the strongest contrast.
 *
 * @param color - An opaque RGB color accepted by the theme parser.
 * @returns A foreground color suitable for text and icons on that accent.
 */
export function getThemeForeground(color: string): string {
  const channels =
    (parseThemeColor(color) ?? 'rgb(15, 20, 25)').match(/\d+/g)?.map(value => {
      const channel = Number(value) / 255
      return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4
    }) ?? []
  const luminance =
    (channels[0] ?? 0) * 0.2126
    + (channels[1] ?? 0) * 0.7152
    + (channels[2] ?? 0) * 0.0722
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05)
    ? '#000000'
    : '#ffffff'
}

/**
 * Produces private fallback variables so public --xvd-* overrides retain precedence.
 *
 * @param value - Stored preset or custom color.
 * @returns CSS variables for a selected accent, or adaptive defaults for Grok.
 */
export function getThemeStyle(value: unknown): Record<string, string> {
  const theme = normalizeTheme(value)
  if (theme === 'grok') {
    return {}
  }
  const color =
    THEME_PRESETS.find(preset => preset.id === theme)?.color ?? theme
  return {
    '--xvd-theme-accent': color,
    '--xvd-theme-on-accent': getThemeForeground(color),
  }
}
