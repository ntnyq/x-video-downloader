import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse, stringify } from 'yaml'
import { version } from '../package.json'
import { prepareReleaseChangelog } from '../scripts/prepareRelease'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const LOCALES = ['en', 'zh_CN', 'zh_TW', 'ja', 'ko'] as const
const NEXT_VERSION = version.replace(/\d+$/, patch => String(Number(patch) + 1))
const NEXT_NAMESPACE = `v${NEXT_VERSION.replaceAll('.', '_')}`

/**
 * Runs release commands in a disposable repository without a remote.
 */
function createReleaseFixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'xvd-release-'))

  for (const path of [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    '.oxfmtrc.jsonc',
    'bump.config.ts',
    'scripts',
    'constants',
    'types',
    'utils',
    'locales',
    'docs/changelog',
    'wxt.config.ts',
    'tests/changelog.test.ts',
    'tests/i18n.test.ts',
  ]) {
    cpSync(join(ROOT, path), join(cwd, path), { recursive: true })
  }

  symlinkSync(join(ROOT, 'node_modules'), join(cwd, 'node_modules'), 'dir')
  writeFileSync(join(cwd, '.gitignore'), 'node_modules\n')
  const draft = {
    baseTag: `v${version}`,
    changes: [
      {
        id: 'release-example',
        type: 'changelog.feature',
        messages: Object.fromEntries(
          LOCALES.map(locale => [locale, `${locale}: Release example $1`]),
        ),
        paths: ['components/video/DownloadSettings.vue'],
        commits: [],
      },
    ],
  }

  writeFileSync(join(cwd, 'docs/changelog/unreleased.yaml'), stringify(draft))
  /**
   * Keeps all Git effects inside the disposable fixture.
   */
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim()

  git('init', '--quiet')
  git('config', 'user.name', 'Release Test')
  git('config', 'user.email', 'release@example.test')
  git('config', 'commit.gpgsign', 'false')
  git('config', 'tag.gpgsign', 'false')
  git('add', '.')
  git('commit', '--quiet', '-m', 'chore: seed release fixture')

  return {
    cwd,
    draft,
    git,
  }
}

/**
 * Invokes the configured CLI with commits and tags confined to the fixture.
 */
function runRelease(cwd: string) {
  return spawnSync(
    'pnpm',
    ['release', '--release', NEXT_VERSION, '--yes', '--no-push'],
    {
      cwd,
      encoding: 'utf8',
      timeout: 60_000,
      env: {
        ...process.env,
        HUSKY: '0',
        RELEASE_TAG: '',
        NODE_TEST_CONTEXT: undefined,
      },
    },
  )
}

test('the configured release command commits the bumped version, history and five translations together', t => {
  const { cwd, git } = createReleaseFixture()

  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const result = runRelease(cwd)

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.equal(
    JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).version,
    NEXT_VERSION,
  )
  assert.deepEqual(
    git('show', '--pretty=', '--name-only', 'HEAD').split('\n').sort(),
    [
      'package.json',
      'constants/changelog.ts',
      'docs/changelog/unreleased.yaml',
      ...LOCALES.map(locale => `locales/${locale}.yaml`),
    ].sort(),
  )
  assert.equal(git('status', '--porcelain'), '')
  assert.equal(git('tag', '--list', `v${NEXT_VERSION}`), `v${NEXT_VERSION}`)

  for (const locale of LOCALES) {
    const messages = parse(
      readFileSync(join(cwd, `locales/${locale}.yaml`), 'utf8'),
    )

    assert.equal(
      messages.changelog.releases[NEXT_NAMESPACE].releaseExample,
      `${locale}: Release example $1`,
    )
    assert.ok(messages.changelog.releases[`v${version.replaceAll('.', '_')}`])
  }

  assert.deepEqual(
    parse(readFileSync(join(cwd, 'docs/changelog/unreleased.yaml'), 'utf8')),
    {
      baseTag: `v${NEXT_VERSION}`,
      changes: [],
    },
  )
  const check = spawnSync('pnpm', ['release:check'], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      RELEASE_TAG: 'v99.0.0',
      NODE_TEST_CONTEXT: undefined,
    },
  })

  assert.notEqual(check.status, 0, `${check.stdout}\n${check.stderr}`)
  assert.match(
    `${check.stdout}\n${check.stderr}`,
    /The release tag must match package.json/,
  )
})

for (const failure of [
  'empty',
  'missing-locale',
  'blank-message',
  'duplicate-id',
  'stale-base',
] as const) {
  test(`release rejects ${failure} notes before changing files or creating a commit or tag`, t => {
    const { cwd, draft, git } = createReleaseFixture()

    t.after(() => rmSync(cwd, { recursive: true, force: true }))
    const change = draft.changes[0]

    assert.ok(change)

    switch (failure) {
      case 'empty':
        draft.changes = []
        break
      case 'missing-locale':
        delete change.messages['ko']
        break
      case 'blank-message':
        change.messages['ja'] = ' '
        break
      case 'duplicate-id':
        draft.changes.push(change)
        break
      case 'stale-base':
        draft.baseTag = 'v0.0.0'
        break
    }

    writeFileSync(join(cwd, 'docs/changelog/unreleased.yaml'), stringify(draft))
    git('add', '.')
    git('commit', '--quiet', '-m', 'chore: prepare invalid notes')
    const head = git('rev-parse', 'HEAD')
    const result = runRelease(cwd)

    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /release notes|translations|translation|Duplicate release key|Reconcile pending notes/,
    )
    assert.equal(git('status', '--porcelain'), '')
    assert.equal(git('rev-parse', 'HEAD'), head)
    assert.equal(git('tag', '--list'), '')
  })
}

test('preparing a release checks every locale before writing and refuses existing release translations', t => {
  const { cwd, git } = createReleaseFixture()

  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const packagePath = join(cwd, 'package.json')
  const manifest = JSON.parse(readFileSync(packagePath, 'utf8'))

  manifest.version = NEXT_VERSION
  writeFileSync(packagePath, JSON.stringify(manifest))
  const localePath = join(cwd, 'locales/ko.yaml')
  const messages = parse(readFileSync(localePath, 'utf8'))

  messages.changelog.releases[NEXT_NAMESPACE] = {
    releaseExample: 'Keep this human translation',
  }
  writeFileSync(localePath, stringify(messages))
  const diff = git('diff')

  assert.throws(
    () => prepareReleaseChangelog(cwd),
    /Release translations already exist/,
  )
  assert.equal(git('diff'), diff)
})

test('mismatched translation placeholders stop the release before commit and tag', t => {
  const { cwd, draft, git } = createReleaseFixture()

  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const change = draft.changes[0]

  assert.ok(change)
  change.messages['ko'] = 'A translation missing its placeholder'
  writeFileSync(join(cwd, 'docs/changelog/unreleased.yaml'), stringify(draft))
  git('add', '.')
  git('commit', '--quiet', '-m', 'chore: prepare mismatched translation')
  const head = git('rev-parse', 'HEAD')
  const result = runRelease(cwd)

  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(`${result.stdout}\n${result.stderr}`, /ko: complete messages/)
  assert.equal(git('rev-parse', 'HEAD'), head)
  assert.equal(git('tag', '--list'), '')
})

test('release refuses a dirty working tree before changing the version', t => {
  const { cwd, git } = createReleaseFixture()

  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  writeFileSync(join(cwd, 'unrelated.txt'), 'Uncommitted work\n')
  const head = git('rev-parse', 'HEAD')
  const result = runRelease(cwd)

  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    /Git working tree is not clean/,
  )
  assert.equal(
    JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).version,
    version,
  )
  assert.equal(git('rev-parse', 'HEAD'), head)
  assert.equal(git('tag', '--list'), '')
})
