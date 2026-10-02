import { i18n } from '#i18n'

/**
 * Translate application error codes while preserving native browser details.
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
 * Use the resolved translation language, including the English fallback.
 */
export function localizeDocument() {
  document.documentElement.lang = i18n.t('uiLanguage')
  document.title = i18n.t('extensionName')
}
