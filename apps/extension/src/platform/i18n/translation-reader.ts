import type { AppLocale } from '@sniptale/platform/i18n/config';
import { readPreparedTranslation } from './locale/state';
import type { TranslationKey } from './types';

export function readSourceTranslation(locale: AppLocale, key: TranslationKey): string {
  return readPreparedTranslation(locale, key);
}
