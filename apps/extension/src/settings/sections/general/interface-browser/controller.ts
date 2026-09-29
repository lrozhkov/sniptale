import { useEffect, useMemo, useState } from 'react';

import { LOCALE_CHANGE_EVENT, THEME_PREFERENCE_CHANGE_EVENT } from '@sniptale/ui/branding';
import {
  getCurrentLocale,
  getStoredLocalePreference,
  setLocalePreference,
  type AppLocale,
  useAppLocale,
} from '../../../../platform/i18n';
import {
  getStoredThemePreference,
  resolveAppTheme,
  setAppThemePreference,
  type AppThemePreference,
} from '../../../../ui/theme';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  buildAppearanceLocaleOptions,
  buildAppearanceThemeOptions,
  buildAppearanceContextMenuOptions,
  buildPopupStartupOptions,
} from './copy';
import { useSettingsStore } from '../../../runtime/store/useSettingsStore';
import { usePopupStartupPreference } from './popup-startup-preference';
import { browserStorage } from '../../../../composition/persistence/infrastructure/browser-storage';
import { getQuickActions } from '../../../../composition/persistence/quick-actions';
import type { QuickAction } from '../../../../contracts/settings';

const logger = createLogger({ namespace: 'settings:appearance' });

function useStoredAppearancePreferences() {
  const [preference, setPreference] = useState<AppThemePreference>('system');
  const [languagePreference, setLanguagePreference] = useState<AppLocale>('ru');

  useEffect(() => {
    const syncPreferences = () => {
      setPreference(getStoredThemePreference() ?? 'system');
      setLanguagePreference(getStoredLocalePreference() ?? getCurrentLocale());
    };

    syncPreferences();
    window.addEventListener('storage', syncPreferences);
    window.addEventListener(THEME_PREFERENCE_CHANGE_EVENT, syncPreferences);
    window.addEventListener(LOCALE_CHANGE_EVENT, syncPreferences);

    return () => {
      window.removeEventListener('storage', syncPreferences);
      window.removeEventListener(THEME_PREFERENCE_CHANGE_EVENT, syncPreferences);
      window.removeEventListener(LOCALE_CHANGE_EVENT, syncPreferences);
    };
  }, []);

  return { languagePreference, preference };
}

function persistLanguagePreference(value: AppLocale): void {
  void setLocalePreference(value).catch((error) => {
    logger.error('Failed to persist locale preference', error);
  });
}

function persistThemePreference(value: AppThemePreference): void {
  void setAppThemePreference(value).catch((error) => {
    logger.error('Failed to persist theme preference', error);
  });
}

export function useAppearanceSection() {
  const locale = useAppLocale();
  const { settings, updateSettings, hasLoaded, error, loadSettings } = useSettingsStore();
  const { languagePreference, preference } = useStoredAppearancePreferences();
  const popupStartup = usePopupStartupPreference();
  const [contextMenuQuickActions, setContextMenuQuickActions] = useState<QuickAction[]>([]);
  const [contextMenuCatalogStatus, setContextMenuCatalogStatus] = useState<
    'loading' | 'ready' | 'failed'
  >('loading');
  const [catalogReload, setCatalogReload] = useState(0);
  useEffect(() => {
    let active = true;
    let generation = 0;
    const load = async () => {
      const current = ++generation;
      setContextMenuCatalogStatus('loading');
      try {
        const actions = await getQuickActions();
        if (!active || current !== generation) return;
        setContextMenuQuickActions(actions);
        setContextMenuCatalogStatus('ready');
      } catch (error) {
        if (!active || current !== generation) return;
        logger.warn('Failed to load context menu command catalog', error);
        setContextMenuCatalogStatus('failed');
      }
    };
    const unsubscribe =
      typeof chrome === 'undefined'
        ? () => undefined
        : browserStorage.subscribeToChanges((changes, area) => {
            if (area === 'local' && changes['sniptale_quick_actions']) void load();
          });
    void load();
    return () => {
      active = false;
      generation += 1;
      unsubscribe();
    };
  }, [catalogReload]);
  const contextMenuOptions = useMemo(() => buildAppearanceContextMenuOptions(locale), [locale]);
  const localeOptions = useMemo(() => buildAppearanceLocaleOptions(locale), [locale]);
  const resolvedTheme = useMemo(() => resolveAppTheme(preference), [preference]);
  const themeOptions = useMemo(() => buildAppearanceThemeOptions(locale), [locale]);
  const popupStartupOptions = useMemo(() => buildPopupStartupOptions(locale), [locale]);
  const contextMenuSettingsStatus: 'ready' | 'loading' | 'failed' = hasLoaded
    ? 'ready'
    : error
      ? 'failed'
      : 'loading';

  return {
    contextMenu: settings.contextMenu,
    contextMenuCatalogStatus,
    contextMenuSettingsStatus,
    contextMenuQuickActions,
    contextMenuViewportPresets: settings.viewportPresets,
    retryContextMenuCatalog: () => setCatalogReload((value) => value + 1),
    retryContextMenuSettings: () => void loadSettings(),
    contextMenuOptions,
    languagePreference,
    locale,
    localeOptions,
    preference,
    popupStartup: {
      loading: popupStartup.popupStartupLoading,
      options: popupStartupOptions,
      selection: popupStartup.popupStartupSelection,
      updateSelection: popupStartup.updatePopupStartupSelection,
    },
    resolvedTheme,
    setLanguagePreference: persistLanguagePreference,
    setPreference: persistThemePreference,
    updateContextMenu: async (patch: Partial<typeof settings.contextMenu>) => {
      await updateSettings({ contextMenu: patch });
    },
    themeOptions,
  };
}
