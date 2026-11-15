import type { ContentRuntimeShimBrowserAdapter } from '@sniptale/platform/browser/content-runtime-shim';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type AppLocale } from '@sniptale/platform/i18n/config';
import {
  normalizePageLaunchPreferences,
  type PageLaunchPreferences,
} from '../../../contracts/page-launch';
import {
  createContentShimTranslations,
  type ContentShimTranslate,
} from '../../../platform/i18n/content-shim';
import type { TranslationKey } from '../../../platform/i18n/types';
import type { ShimQuickAction } from './quick-actions';

export interface ShimPagePresentation {
  preferences: PageLaunchPreferences;
  locale: AppLocale;
  theme: 'light' | 'dark' | 'system';
  translate: ContentShimTranslate;
}
const bundledNames: Readonly<
  Record<string, Extract<TranslationKey, `shared.defaults.${string}`> | undefined>
> = {
  'default-visible-download': 'shared.defaults.quickActionVisibleDownload',
  'default-full-page-download': 'shared.defaults.quickActionFullPageDownload',
  'default-selection-download': 'shared.defaults.quickActionSelectionDownload',
  'default-visible-copy': 'shared.defaults.quickActionVisibleCopy',
  'default-visible-edit': 'shared.defaults.quickActionVisibleEdit',
  'default-desktop-capture': 'shared.defaults.quickActionDesktopDownload',
  'default-visible-library': 'shared.defaults.quickActionVisibleLibrary',
};
export function getShimQuickActionName(
  action: ShimQuickAction,
  translate: ContentShimTranslate
): string {
  const bundled = bundledNames[action.bundledId ?? ''] ?? bundledNames[action.id];
  return bundled && action.customized !== true
    ? translate(bundled)
    : action.name?.trim() || action.id;
}
export function createShimPreferencesLoader(browser: ContentRuntimeShimBrowserAdapter) {
  const translations = createContentShimTranslations();
  return async (): Promise<ShimPagePresentation> => {
    const [sync, local] = await Promise.all([
      browser.getSyncStorage(['sniptale_settings']),
      browser
        .getLocalStorage(['sniptale-locale-preference', 'sniptale-theme-preference'])
        .catch((): Record<string, unknown> => ({})),
    ]);
    const settings: unknown = sync['sniptale_settings'];
    const raw: unknown =
      typeof settings === 'object' && settings !== null
        ? Object.getOwnPropertyDescriptor(settings, 'pageLaunch')?.value
        : undefined;
    const locale: unknown = local['sniptale-locale-preference'];
    const theme: unknown = local['sniptale-theme-preference'];
    const selected = SUPPORTED_LOCALES.find((candidate) => candidate === locale) ?? DEFAULT_LOCALE;
    const preferences = normalizePageLaunchPreferences(raw);
    if (preferences.enabled) await translations.prepare(selected);
    return {
      preferences,
      locale: selected,
      translate: translations.forLocale(selected),
      theme: theme === 'light' || theme === 'dark' ? theme : 'system',
    };
  };
}
