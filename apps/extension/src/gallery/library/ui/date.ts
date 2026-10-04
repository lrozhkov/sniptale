import { getIntlLocale, type AppLocale } from '@sniptale/platform/i18n/config';
import { formatDateTime, getCurrentLocale } from '../../../platform/i18n';

const GALLERY_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

export function createGalleryDateFormatter(
  locale: AppLocale = getCurrentLocale()
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(getIntlLocale(locale), GALLERY_DATE_OPTIONS);
}

export function formatDate(timestamp: number): string {
  return formatDateTime(timestamp, GALLERY_DATE_OPTIONS, getCurrentLocale());
}
