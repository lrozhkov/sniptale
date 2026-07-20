import type { AppLocale } from '../../../platform/i18n';

export type LocalizedPair = readonly [string, string];

export function localizePreviewCopy(locale: AppLocale, pair: LocalizedPair): string {
  return locale === 'ru' ? pair[0] : pair[1];
}
