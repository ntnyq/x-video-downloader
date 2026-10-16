import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import * as utils from '@ntnyq/utils'
import { generateChromeMessages, parseMessagesFile } from '@wxt-dev/i18n/build'
import ts from 'typescript'
import { CHANGELOG_ENTRIES } from '../constants/changelog'
import { DOWNLOAD_STATE_LABELS } from '../constants/download'
import { QUALITY_OPTIONS } from '../constants/preferences'
import { THEME_PRESETS } from '../constants/theme'
import { formatBytes, validateFilenameTemplate } from '../utils/preferences'
import { formatVariant } from '../utils/video'

const manifestMessageKeys = [
  ...readFileSync(
    new URL('../wxt.config.ts', import.meta.url),
    'utf8',
  ).matchAll(/__MSG_(\w+)__/g),
].map(match => match[1])

const LOCALES = ['en', 'zh_CN', 'zh_TW', 'ja', 'ko']
const reference = await parseMessagesFile(
  fileURLToPath(new URL('../locales/en.yaml', import.meta.url)),
)
const source = ts.transpileModule(
  readFileSync(new URL('../utils/i18n.ts', import.meta.url), 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText

for (const locale of LOCALES) {
  test(`${locale}: complete messages, matching substitutions and localized boundaries`, async () => {
    const parsed = await parseMessagesFile(
      fileURLToPath(new URL(`../locales/${locale}.yaml`, import.meta.url)),
    )
    /**
     * Extracts translation keys and substitution contracts for cross-locale comparison.
     *
     * @param messages - Parsed locale messages to inspect.
     * @returns Comparable key and placeholder signatures in source order.
     */
    const signatures = (messages: typeof reference) =>
      messages.map(({ key, substitutions, namedSubstitutions }) => ({
        key,
        substitutions,
        namedSubstitutions,
      }))
    assert.deepEqual(signatures(parsed), signatures(reference))
    const applicationMessages = parsed.filter(
      ({ key }) => !key[0]?.startsWith('@@'),
    )
    const messages = generateChromeMessages(parsed)
    assert.equal(
      Object.keys(messages).length,
      applicationMessages.length,
      'Message keys must not collide after flattening',
    )
    assert.ok(
      applicationMessages.every(({ key }) => key.length >= 2),
      'Group messages into namespaces',
    )
    assert.ok(manifestMessageKeys.length > 0)
    for (const key of manifestMessageKeys) {
      assert.ok(
        key && messages[key]?.message,
        `Missing manifest message ${locale}.${key}`,
      )
    }
    for (const [key, { message }] of Object.entries(messages)) {
      assert.ok(message.trim(), `${locale}.${key} is empty`)
    }
    /**
     * Reads a generated locale message and fails immediately when the key is absent.
     *
     * @param key - Translation key requested by the module under test.
     * @returns The generated message text.
     * @throws When the locale does not provide the requested message.
     */
    const t = (key: string) => {
      const message = messages[key.replaceAll('.', '_')]?.message
      assert.ok(message, `Missing ${locale}.${key}`)
      return message
    }
    for (const entry of CHANGELOG_ENTRIES) {
      for (const change of entry.changes) {
        assert.ok(t(change.type))
        assert.ok(t(change.key))
      }
    }
    for (const key of [
      ...Object.values(DOWNLOAD_STATE_LABELS),
      ...QUALITY_OPTIONS.map(option => option.label),
      ...THEME_PRESETS.map(preset => preset.label),
    ]) {
      assert.ok(t(key))
    }
    const exports: {
      /**
       * Error formatter exported by the transpiled localization module.
       *
       * @param error - Error code or browser text to localize.
       * @returns The localized or preserved error message.
       */
      localizeDownloadError?: (error: unknown) => string
      /**
       * Updates the document fixture using the selected locale.
       */
      localizeDocument?: () => void
    } = {}
    const document = { documentElement: { lang: '' }, title: '' }
    runInNewContext(source, {
      exports,
      document,
      /**
       * Supplies the current locale's translation stub to the transpiled module.
       *
       * @returns An i18n module backed by the test locale's generated messages.
       */
      require(id: string) {
        if (id === '@ntnyq/utils') {
          return utils
        }
        return {
          i18n: { t },
        }
      },
    })
    assert.ok(exports.localizeDownloadError)
    assert.ok(exports.localizeDocument)
    exports.localizeDocument()
    assert.equal(document.documentElement.lang, t('extension.language'))
    assert.equal(document.title, t('extension.name'))
    for (const code of [
      'downloadFailed',
      'actionFailed',
      'invalidSender',
      'invalidRequest',
      'foreignDownload',
      'finishedDownload',
      'retryUnavailable',
      'duplicateDownload',
      'pauseUnavailable',
      'resumeUnavailable',
      'queueFull',
    ]) {
      assert.equal(exports.localizeDownloadError(code), t(`errors.${code}`))
    }
    assert.equal(
      exports.localizeDownloadError(undefined),
      t('errors.downloadFailed'),
    )
    assert.equal(
      exports.localizeDownloadError('USER_CANCELED'),
      t('download.cancelled'),
    )
    assert.equal(
      exports.localizeDownloadError('NETWORK_FAILED'),
      'NETWORK_FAILED',
    )
    for (const input of ['', 'x'.repeat(161), '../video', '{unsupported}']) {
      assert.ok(t(validateFilenameTemplate(input)))
    }
    assert.equal(
      formatBytes(-1, t('common.unknownSize')),
      t('common.unknownSize'),
    )
    assert.equal(
      formatVariant(
        { url: '', width: 0, height: 0, bitrate: 0 },
        t('quality.originalMp4'),
      ),
      t('quality.originalMp4'),
    )
    assert.equal(
      messages['filename_help']?.message.match(/\$[1-5]/g)?.length,
      5,
    )
  })
}
