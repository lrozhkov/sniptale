import { translate, type AppLocale, type TranslationKey } from '.';

const recommendedTitles: Record<string, TranslationKey> = {
  screenshots: 'settings.appearance.contextMenuGroupScreenshots',
  video: 'settings.appearance.contextMenuGroupVideo',
  export: 'settings.appearance.contextMenuGroupExport',
  'page-link': 'settings.appearance.contextMenuPageLinkCopyLabel',
  window: 'settings.appearance.contextMenuGroupWindow',
};

/** Translate generated block headings; an edited/custom title remains literal user text. */
export function contextMenuSectionTitle(id: string, title: string, locale?: AppLocale): string {
  const group = /^(?:recommended|block)-(screenshots|video|export|page-link|window)$/.exec(id)?.[1];
  const key = group && recommendedTitles[group];
  if (!key || ![translate(key, 'en'), translate(key, 'ru')].includes(title)) return title;
  return translate(key, locale);
}
