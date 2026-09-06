import type { AppLocale } from '@sniptale/platform/i18n/config';
import { createTranslator, translate } from './index';
import type { Translate, TranslationKey } from './types';

type UserFacingErrorDetail = 'browserCommunication' | 'externalService' | 'storage' | 'unexpected';

const DETAIL_KEYS: Record<UserFacingErrorDetail, TranslationKey> = {
  browserCommunication: 'common.errors.browserCommunicationDetail',
  externalService: 'common.errors.externalServiceDetail',
  storage: 'common.errors.storageDetail',
  unexpected: 'common.errors.unexpectedDetail',
};

/**
 * Builds UI-safe failure copy. The cause is accepted only to make intentional
 * redaction explicit at call sites; technical details belong in internal logs.
 */
export function createUserFacingErrorMessage(args: {
  cause?: unknown;
  detail: UserFacingErrorDetail;
  locale?: AppLocale;
  summaryKey: TranslationKey;
  translator?: Translate;
}): string {
  void args.cause;
  const translator = args.translator ?? (args.locale ? createTranslator(args.locale) : translate);
  const summary = translator(args.summaryKey).trim();
  const sentenceSummary = /[.!?…:]$/u.test(summary) ? summary : `${summary}.`;
  return `${sentenceSummary} ${translator(DETAIL_KEYS[args.detail])}`;
}

export function getUserFacingErrorDetail(
  detail: UserFacingErrorDetail,
  locale?: AppLocale
): string {
  const translator = locale ? createTranslator(locale) : translate;
  return translator(DETAIL_KEYS[detail]);
}
