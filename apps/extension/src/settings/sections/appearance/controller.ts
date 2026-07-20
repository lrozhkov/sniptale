import { useEffect, useMemo, useState } from 'react';

import { LOCALE_CHANGE_EVENT, THEME_PREFERENCE_CHANGE_EVENT } from '@sniptale/ui/branding';
import {
  getCurrentLocale,
  getStoredLocalePreference,
  setLocalePreference,
  type AppLocale,
  useAppLocale,
} from '../../../platform/i18n';
import {
  getStoredThemePreference,
  resolveAppTheme,
  setAppThemePreference,
  type AppThemePreference,
} from '../../../ui/theme';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  buildAppearanceLocaleOptions,
  buildAppearanceThemeOptions,
  buildAppearanceContextMenuOptions,
} from './copy';
import { useSettingsStore } from '../../runtime/store/useSettingsStore';

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
  const { settings, updateSettings } = useSettingsStore();
  const { languagePreference, preference } = useStoredAppearancePreferences();
  const contextMenuOptions = useMemo(() => buildAppearanceContextMenuOptions(locale), [locale]);
  const localeOptions = useMemo(() => buildAppearanceLocaleOptions(locale), [locale]);
  const resolvedTheme = useMemo(() => resolveAppTheme(preference), [preference]);
  const themeOptions = useMemo(() => buildAppearanceThemeOptions(locale), [locale]);

  return {
    anonymousCrossOriginSnapshotAssetsEnabled: settings.anonymousCrossOriginSnapshotAssetsEnabled,
    authenticatedSnapshotAssetsEnabled: settings.authenticatedSnapshotAssetsEnabled,
    contextMenu: settings.contextMenu,
    contextMenuOptions,
    languagePreference,
    locale,
    localeOptions,
    preference,
    resolvedTheme,
    rawDiagnosticsEnabled: settings.rawDiagnosticsEnabled,
    setLanguagePreference: persistLanguagePreference,
    setPreference: persistThemePreference,
    updateContextMenu: async (patch: Partial<typeof settings.contextMenu>) => {
      await updateSettings({ contextMenu: patch });
    },
    updateAuthenticatedSnapshotAssetsEnabled: async (enabled: boolean) => {
      await updateSettings({ authenticatedSnapshotAssetsEnabled: enabled });
    },
    updateAnonymousCrossOriginSnapshotAssetsEnabled: async (enabled: boolean) => {
      await updateSettings({ anonymousCrossOriginSnapshotAssetsEnabled: enabled });
    },
    updateRawDiagnosticsEnabled: async (enabled: boolean) => {
      await updateSettings({ rawDiagnosticsEnabled: enabled });
    },
    themeOptions,
  };
}
