import type { AppLocale } from '../../platform/i18n';

export function localize(locale: AppLocale, ru: string, en: string): string {
  return locale === 'ru' ? ru : en;
}
