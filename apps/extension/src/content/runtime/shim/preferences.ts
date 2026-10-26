import type { ContentRuntimeShimBrowserAdapter } from '@sniptale/platform/browser/content-runtime-shim';
import { DEFAULT_LOCALE, type AppLocale } from '@sniptale/platform/i18n/config';
import {
  normalizePageLaunchPreferences,
  type PageLaunchPreferences,
} from '../../../contracts/page-launch';
import { sharedDefaultsMessages } from '../../../platform/i18n/messages/shared/defaults';
import type { ShimQuickAction } from './quick-actions';

export interface ShimPagePresentation {
  preferences: PageLaunchPreferences;
  locale: AppLocale;
  theme: 'light' | 'dark' | 'system';
}
const bundledNames: Readonly<Record<string, Readonly<Record<AppLocale, string>> | undefined>> = {
  'default-visible-download': sharedDefaultsMessages.quickActionVisibleDownload,
  'default-full-page-download': sharedDefaultsMessages.quickActionFullPageDownload,
  'default-selection-download': sharedDefaultsMessages.quickActionSelectionDownload,
  'default-visible-copy': sharedDefaultsMessages.quickActionVisibleCopy,
  'default-visible-edit': sharedDefaultsMessages.quickActionVisibleEdit,
  'default-desktop-capture': sharedDefaultsMessages.quickActionDesktopDownload,
  'default-visible-library': sharedDefaultsMessages.quickActionVisibleLibrary,
};
export function getShimQuickActionName(action: ShimQuickAction, locale: AppLocale): string {
  const bundled = bundledNames[action.bundledId ?? ''] ?? bundledNames[action.id];
  return bundled && action.customized !== true ? bundled[locale] : action.name?.trim() || action.id;
}
export function createShimPreferencesLoader(browser: ContentRuntimeShimBrowserAdapter) {
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
    return {
      preferences: normalizePageLaunchPreferences(raw),
      locale: locale === 'ru' || locale === 'en' ? locale : DEFAULT_LOCALE,
      theme: theme === 'light' || theme === 'dark' ? theme : 'system',
    };
  };
}
