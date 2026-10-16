import type { ChangelogEntry } from '../types/changelog'

/**
 * Bundled release history, newest first. Add matching messages in every locale
 * when preparing a release; keep version numbers aligned with package.json.
 */
export const CHANGELOG_ENTRIES = [
  {
    date: '2026-10-12',
    version: '0.0.3',
    changes: [
      {
        key: 'changelog.releases.v0_0_3.interface',
        type: 'changelog.improvement',
      },
      { key: 'changelog.releases.v0_0_3.quickDownload', type: 'changelog.fix' },
    ],
  },
  {
    date: '2026-10-09',
    version: '0.0.2',
    changes: [
      { key: 'changelog.releases.v0_0_2.queue', type: 'changelog.feature' },
      { key: 'changelog.releases.v0_0_2.batch', type: 'changelog.feature' },
      {
        key: 'changelog.releases.v0_0_2.interface',
        type: 'changelog.improvement',
      },
      { key: 'changelog.releases.v0_0_2.position', type: 'changelog.fix' },
    ],
  },
  {
    date: '2026-10-03',
    version: '0.0.1',
    changes: [
      { key: 'changelog.releases.v0_0_1.download', type: 'changelog.feature' },
      {
        key: 'changelog.releases.v0_0_1.preferences',
        type: 'changelog.feature',
      },
      { key: 'changelog.releases.v0_0_1.languages', type: 'changelog.feature' },
    ],
  },
] as const satisfies readonly ChangelogEntry[]
