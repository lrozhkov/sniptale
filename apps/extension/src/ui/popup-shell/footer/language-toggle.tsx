import { createLogger } from '@sniptale/platform/observability/logger';
import {
  setLocalePreference,
  translate,
  useAppLocale,
  type AppLocale,
} from '../../../platform/i18n/popup';

const logger = createLogger({ namespace: 'shared:ui:popup-footer-language' });
const LANGUAGE_CONTENT_CLASS_NAME = [
  'transition-transform duration-200 ease-out',
  'group-hover:-translate-y-px group-focus-visible:-translate-y-px',
  'motion-reduce:transition-none',
].join(' ');

function getNextLocale(locale: AppLocale): AppLocale {
  return locale === 'ru' ? 'en' : 'ru';
}

function getLocaleName(locale: AppLocale): string {
  return translate(locale === 'ru' ? 'common.languages.ru' : 'common.languages.en');
}

export function PopupFooterLanguageToggle() {
  const locale = useAppLocale();
  const nextLocale = getNextLocale(locale);

  return (
    <button
      type="button"
      aria-label={translate('popup.common.footerLanguageToggleAria')}
      className={[
        'group inline-flex h-7 min-w-7 items-center justify-center rounded-full border-none px-1',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_88%,transparent)]',
        'text-[9px] font-semibold uppercase text-[var(--sniptale-color-accent)]',
        'transition-colors hover:text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
      data-locale-preference={locale}
      onClick={() => {
        void setLocalePreference(nextLocale).catch((error) => {
          logger.error('Failed to persist popup footer locale preference', error);
        });
      }}
      title={`${getLocaleName(locale)} → ${getLocaleName(nextLocale)}`}
    >
      <span className={LANGUAGE_CONTENT_CLASS_NAME}>{locale}</span>
    </button>
  );
}
