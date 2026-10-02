import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { generateChromeMessages, parseMessagesFile } from '@wxt-dev/i18n/build'
import ts from 'typescript'
import { formatBytes, validateFilenameTemplate } from '../utils/preferences'
import { formatVariant } from '../utils/video'

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
    const messages = generateChromeMessages(parsed)
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
      const message = messages[key]?.message
      assert.ok(message, `Missing ${locale}.${key}`)
      return message
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
      require: () => ({ i18n: { t } }),
    })
    assert.ok(exports.localizeDownloadError)
    assert.ok(exports.localizeDocument)
    exports.localizeDocument()
    assert.equal(document.documentElement.lang, t('uiLanguage'))
    assert.equal(document.title, t('extensionName'))
    for (const code of [
      'downloadFailed',
      'actionFailed',
      'invalidSender',
      'invalidRequest',
      'foreignDownload',
      'finishedDownload',
      'retryUnavailable',
    ]) {
      assert.equal(exports.localizeDownloadError(code), t(code))
    }
    assert.equal(exports.localizeDownloadError(undefined), t('downloadFailed'))
    assert.equal(
      exports.localizeDownloadError('USER_CANCELED'),
      t('downloadCancelled'),
    )
    assert.equal(
      exports.localizeDownloadError('NETWORK_FAILED'),
      'NETWORK_FAILED',
    )
    for (const input of ['', 'x'.repeat(161), '../video', '{unsupported}']) {
      assert.ok(t(validateFilenameTemplate(input)))
    }
    assert.equal(formatBytes(-1, t('unknownSize')), t('unknownSize'))
    assert.equal(
      formatVariant(
        { url: '', width: 0, height: 0, bitrate: 0 },
        t('originalMp4'),
      ),
      t('originalMp4'),
    )
    assert.equal(messages['filenameHelp']?.message.match(/\$[1-5]/g)?.length, 5)
  })
}
