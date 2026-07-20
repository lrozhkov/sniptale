import { useEffect } from 'react';
import { type AppLocale, type TranslationKey } from './types';
import { useAppLocale } from './locale/hook';
import { readTranslation, resolveTranslationDictionary } from './translation-reader';

interface PageLocaleMetadata {
  locale: AppLocale;
  title: string;
}

function applyPageLocaleMetadata(metadata: PageLocaleMetadata): void {
  document.documentElement.lang = metadata.locale;
  document.title = metadata.title;
}

export function usePageLocaleMetadata(titleKey: TranslationKey): AppLocale {
  const locale = useAppLocale();

  useEffect(() => {
    applyPageLocaleMetadata({
      locale,
      title: readTranslation(resolveTranslationDictionary(locale), titleKey),
    });
  }, [locale, titleKey]);

  return locale;
}
