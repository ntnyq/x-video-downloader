import type { GeneratedI18nStructure } from '#i18n'

export interface ChangelogEntry {
  /**
   * Release date in YYYY-MM-DD format.
   */
  date: string
  /**
   * Published extension version, matching the release tag and manifest.
   */
  version: string
  /**
   * User-facing changes translated by the bundled locale files.
   */
  changes: readonly {
    key: Extract<keyof GeneratedI18nStructure, `changelog.releases.${string}`>
    type: 'changelog.feature' | 'changelog.fix' | 'changelog.improvement'
  }[]
}
