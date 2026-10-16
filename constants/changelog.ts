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
      { key: 'changelogRelease003Interface', type: 'changelogImprovement' },
      { key: 'changelogRelease003QuickDownload', type: 'changelogFix' },
    ],
  },
  {
    date: '2026-10-09',
    version: '0.0.2',
    changes: [
      { key: 'changelogRelease002Queue', type: 'changelogFeature' },
      { key: 'changelogRelease002Batch', type: 'changelogFeature' },
      { key: 'changelogRelease002Interface', type: 'changelogImprovement' },
      { key: 'changelogRelease002Position', type: 'changelogFix' },
    ],
  },
  {
    date: '2026-10-03',
    version: '0.0.1',
    changes: [
      { key: 'changelogRelease001Download', type: 'changelogFeature' },
      { key: 'changelogRelease001Preferences', type: 'changelogFeature' },
      { key: 'changelogRelease001Languages', type: 'changelogFeature' },
    ],
  },
] as const satisfies readonly ChangelogEntry[]
