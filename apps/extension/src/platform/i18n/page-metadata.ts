import { useEffect } from 'react';
import { type AppLocale, type TranslationKey } from './types';
import { useAppLocale } from './locale/hook';
import { readSourceTranslation } from './translation-reader';

interface PageLocaleMetadata {
  locale: AppLocale;
  title: string;
}

function applyPageLocaleMetadata(metadata: PageLocaleMetadata): void {
  document.documentElement.lang = metadata.locale;
  document.title = metadata.title;
}

/** Keeps browser metadata synchronized with the active document and locale. */
export function usePageLocaleMetadata(
  titleKey: TranslationKey,
  documentName?: string | null,
  modeKey?: TranslationKey
): AppLocale {
  const locale = useAppLocale();

  useEffect(() => {
    applyPageLocaleMetadata({
      locale,
      title: documentName?.trim()
        ? [documentName.trim(), modeKey ? readSourceTranslation(locale, modeKey) : null]
            .filter(Boolean)
            .join(' · ')
        : readSourceTranslation(locale, titleKey),
    });
  }, [locale, titleKey, documentName, modeKey]);

  return locale;
}
