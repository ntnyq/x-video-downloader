import { i18n } from '#i18n'

/**
 * Translates application error codes while preserving native browser details.
 *
 * @param error - Application code, browser error message, or unknown failure value.
 * @returns A localized message, the native error text, or a generic failure label.
 */
export function localizeDownloadError(error: unknown): string {
  switch (error) {
    case 'downloadFailed':
    case 'actionFailed':
    case 'invalidSender':
    case 'invalidRequest':
    case 'foreignDownload':
    case 'finishedDownload':
    case 'retryUnavailable':
      return i18n.t(error)
    case 'USER_CANCELED':
      return i18n.t('downloadCancelled')
    default:
      return typeof error === 'string' && error
        ? error
        : i18n.t('downloadFailed')
  }
}

/**
 * Sets the document language and title using the resolved translation locale.
 * The resolved locale includes the English fallback when a language is unavailable.
 */
export function localizeDocument() {
  document.documentElement.lang = i18n.t('uiLanguage')
  document.title = i18n.t('extensionName')
}
