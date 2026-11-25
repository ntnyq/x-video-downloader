import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { isRecord } from '@ntnyq/utils'
import ts from 'typescript'
import { parseDocument } from 'yaml'

const LOCALES = ['en', 'zh_CN', 'zh_TW', 'ja', 'ko'] as const
const CHANGE_TYPES = new Set([
  'changelog.feature',
  'changelog.improvement',
  'changelog.fix',
])

/**
 * Validates pending translations before a bump, or promotes them after it.
 * All inputs are checked before writing any release files.
 */
export function prepareReleaseChangelog(
  cwd: string,
  options: { checkOnly?: boolean; date?: string } = {},
): string[] {
  const packageJson: unknown = JSON.parse(
    readFileSync(resolve(cwd, 'package.json'), 'utf8'),
  )

  assert.ok(isRecord(packageJson))
  const version = packageJson['version']

  assert.ok(
    typeof version === 'string' && /^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version),
    'Invalid extension version',
  )

  const historyPath = 'constants/changelog.ts'
  const history = readFileSync(resolve(cwd, historyPath), 'utf8')
  const source = ts.createSourceFile(
    historyPath,
    history,
    ts.ScriptTarget.Latest,
    true,
  )
  const declaration = source.statements
    .filter(ts.isVariableStatement)
    .flatMap(statement => statement.declarationList.declarations)
    .find(variable => variable.name.getText(source) === 'CHANGELOG_ENTRIES')
  let entries = declaration?.initializer

  while (
    entries
    && (ts.isAsExpression(entries) || ts.isSatisfiesExpression(entries))
  ) {
    entries = entries.expression
  }

  assert.ok(
    entries && ts.isArrayLiteralExpression(entries),
    'Cannot locate bundled release history',
  )
  const latest = entries.elements[0]

  assert.ok(latest && ts.isObjectLiteralExpression(latest))
  const latestVersion = latest.properties.find(
    property =>
      ts.isPropertyAssignment(property)
      && property.name.getText(source) === 'version',
  )

  assert.ok(
    latestVersion
      && ts.isPropertyAssignment(latestVersion)
      && ts.isStringLiteral(latestVersion.initializer),
  )
  const previousVersion = latestVersion.initializer.text

  const draftPath = 'docs/changelog/unreleased.yaml'
  const draft = parseDocument(readFileSync(resolve(cwd, draftPath), 'utf8'))

  assert.equal(draft.errors.length, 0, 'Invalid pending changelog YAML')
  const pending: unknown = draft.toJS()

  assert.ok(isRecord(pending))
  assert.equal(
    pending['baseTag'],
    `v${previousVersion}`,
    'Reconcile pending notes with the latest release first',
  )
  const pendingChanges = pending['changes']

  assert.ok(
    Array.isArray(pendingChanges) && pendingChanges.length > 0,
    'Add five-language release notes to docs/changelog/unreleased.yaml before releasing',
  )

  const keys = new Set<string>()
  const changes = pendingChanges.map((pendingChange: unknown) => {
    assert.ok(isRecord(pendingChange), 'Invalid pending change')
    const id = pendingChange['id']
    const type = pendingChange['type']
    const translations = pendingChange['messages']

    assert.ok(
      typeof id === 'string' && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id),
      'Invalid pending change ID',
    )
    const key = id.replace(/-([a-z0-9])/g, (_, character: string) =>
      character.toUpperCase(),
    )

    assert.ok(!keys.has(key), `Duplicate release key: ${key}`)
    keys.add(key)
    assert.ok(
      typeof type === 'string' && CHANGE_TYPES.has(type),
      `Invalid change type: ${id}`,
    )
    assert.ok(isRecord(translations), `Missing translations: ${id}`)
    assert.deepEqual(
      Object.keys(translations).sort(),
      [...LOCALES].sort(),
      `Expected all five translations: ${id}`,
    )
    const messages = new Map<string, string>()

    for (const locale of LOCALES) {
      const message: unknown = translations[locale]

      assert.ok(
        typeof message === 'string' && message.trim(),
        `Missing ${locale} translation: ${id}`,
      )
      messages.set(locale, message)
    }

    const paths = pendingChange['paths']
    const commits = pendingChange['commits']

    assert.ok(
      Array.isArray(paths)
        && paths.length > 0
        && paths.every(path => typeof path === 'string' && path.trim()),
      `Missing source paths: ${id}`,
    )
    assert.ok(
      Array.isArray(commits)
        && commits.every(
          commit =>
            typeof commit === 'string' && /^[a-f0-9]{7,40}$/.test(commit),
        ),
      `Invalid source commits: ${id}`,
    )

    return {
      key,
      type,
      messages,
    }
  })

  const locales = LOCALES.map(locale => {
    const path = `locales/${locale}.yaml`
    const document = parseDocument(readFileSync(resolve(cwd, path), 'utf8'))

    assert.equal(document.errors.length, 0, `Invalid locale YAML: ${locale}`)
    assert.ok(
      document.hasIn(['changelog', 'releases']),
      `Missing changelog namespace: ${locale}`,
    )

    return {
      locale,
      path,
      document,
    }
  })

  if (options.checkOnly) {
    assert.equal(
      version,
      previousVersion,
      'The current package version must match the bundled history before releasing',
    )

    return []
  }

  assert.ok(
    version.localeCompare(previousVersion, 'en', { numeric: true }) > 0,
    'Bump package.json before preparing release notes',
  )
  const date = options.date ?? new Date().toISOString().slice(0, 10)

  assert.ok(
    /^\d{4}-\d{2}-\d{2}$/.test(date)
      && new Date(date).toISOString().slice(0, 10) === date,
    'Invalid release date',
  )
  const namespace = `v${version.replaceAll('.', '_')}`
  const files = new Map<string, string>()

  for (const { locale, path, document } of locales) {
    assert.ok(
      !document.hasIn(['changelog', 'releases', namespace]),
      `Release translations already exist: ${locale}.${namespace}`,
    )

    for (const change of changes) {
      document.setIn(
        ['changelog', 'releases', namespace, change.key],
        change.messages.get(locale),
      )
    }

    files.set(path, document.toString({ lineWidth: 0 }))
  }

  const release = JSON.stringify(
    {
      date,
      version,
      changes: changes.map(({ key, type }) => ({
        key: `changelog.releases.${namespace}.${key}`,
        type,
      })),
    },
    null,
    2,
  ).replaceAll('\n', '\n  ')

  files.set(
    historyPath,
    `${history.slice(0, entries.elements.pos)}\n  ${release},${history.slice(entries.elements.pos)}`,
  )
  draft.set('baseTag', `v${version}`)
  draft.set('changes', [])
  files.set(draftPath, draft.toString({ lineWidth: 0 }))

  for (const [path, content] of files) {
    writeFileSync(resolve(cwd, path), content)
  }

  const changedFiles = [...files.keys()]

  execFileSync('pnpm', ['exec', 'oxfmt', ...changedFiles], {
    cwd,
    stdio: 'inherit',
  })

  return changedFiles
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  try {
    prepareReleaseChangelog(process.cwd(), {
      checkOnly: process.argv.includes('--check'),
    })
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
