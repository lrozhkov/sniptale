import { translate, type AppLocale, type TranslationKey } from '.';

// Generated trees store canonical English titles. These aliases recognize historical saved data,
// not live translations. New locales do not add aliases or require additional catalogs here.
const recommendedTitles: Record<string, { key: TranslationKey; storedTitles: readonly string[] }> =
  {
    screenshots: {
      key: 'settings.appearance.contextMenuGroupScreenshots',
      storedTitles: ['Screenshots', 'Снимки'],
    },
    video: {
      key: 'settings.appearance.contextMenuGroupVideo',
      storedTitles: ['Video', 'Видео'],
    },
    export: {
      key: 'settings.appearance.contextMenuGroupExport',
      storedTitles: ['Export', 'Экспорт'],
    },
    'page-link': {
      key: 'settings.appearance.contextMenuPageLinkCopyLabel',
      storedTitles: ['Copy title and link', 'Копировать название и ссылку'],
    },
    window: {
      key: 'settings.appearance.contextMenuGroupWindow',
      storedTitles: ['Window size', 'Размер окна'],
    },
  };

/** Translate generated block headings; an edited/custom title remains literal user text. */
export function contextMenuSectionTitle(id: string, title: string, locale?: AppLocale): string {
  const group = /^(?:recommended|block)-(screenshots|video|export|page-link|window)$/.exec(id)?.[1];
  const generated = group && recommendedTitles[group];
  if (!generated || !generated.storedTitles.includes(title)) return title;
  return translate(generated.key, locale);
}
