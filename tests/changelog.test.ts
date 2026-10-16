import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CHANGELOG_ENTRIES } from '../constants/changelog'
import { version } from '../package.json'

test('bundled release history starts with the package version and contains unique releases in descending order', () => {
  const versions = CHANGELOG_ENTRIES.map(entry => entry.version)
  assert.equal(
    versions[0],
    version,
    'Add release notes when bumping package.json',
  )
  assert.equal(new Set(versions).size, versions.length)
  assert.deepEqual(
    versions,
    [...versions].sort((a, b) => b.localeCompare(a, 'en', { numeric: true })),
  )
  for (const entry of CHANGELOG_ENTRIES) {
    assert.match(entry.version, /^\d+\.\d+\.\d+(?:\.\d+)?$/)
    assert.equal(new Date(entry.date).toISOString().slice(0, 10), entry.date)
    assert.ok(entry.changes.length > 0)
  }
})
