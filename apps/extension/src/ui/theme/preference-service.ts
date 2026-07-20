import { THEME_PREFERENCE_CHANGE_EVENT } from '@sniptale/ui/branding';
import { browserStorage } from '../../composition/persistence/infrastructure/browser-storage';
import { createStorageBackedPreferenceService } from '../../composition/persistence/infrastructure/preference-service';
import type { AppTheme, AppThemePreference } from '@sniptale/ui/theme/types';
import { runWithPersistenceMutationPermit } from '../../composition/persistence/infrastructure/mutation-barrier';

const THEME_STORAGE_KEY = 'sniptale-theme-preference';
const THEME_STORAGE_AREA: chrome.storage.AreaName = 'local';

interface ThemePreferenceService {
  ensureHydrated(): Promise<void>;
  getStoredPreference(): AppThemePreference | null;
  setPreference(preference: AppThemePreference): Promise<void>;
  subscribe(listener: (preference: AppThemePreference | null) => void): () => void;
}

function getThemeMediaQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null;
  }

  return window.matchMedia('(prefers-color-scheme: dark)');
}

function isThemePreference(value: string | null): value is AppThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

function normalizeStoredThemePreference(value: unknown): AppThemePreference | null {
  return isThemePreference(typeof value === 'string' ? value : null)
    ? (value as AppThemePreference)
    : null;
}

function canObserveThemeStorageChanges(): boolean {
  return typeof browserStorage.canObserveChanges === 'function'
    ? browserStorage.canObserveChanges()
    : true;
}

function usesBrowserThemeStorage(): boolean {
  const localStorageArea = browserStorage.local;
  return (
    localStorageArea != null &&
    typeof localStorageArea.isAvailable === 'function' &&
    localStorageArea.isAvailable()
  );
}

function readLocalStorageThemePreference(): AppThemePreference | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : null;
  } catch {
    return null;
  }
}

function writeLocalStorageThemePreference(preference: AppThemePreference): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  return runWithPersistenceMutationPermit(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  });
}

export function resolveAppTheme(preference: AppThemePreference = 'system'): AppTheme {
  if (preference === 'light' || preference === 'dark') {
    return preference;
  }

  return getThemeMediaQuery()?.matches ? 'dark' : 'light';
}

function dispatchThemeChange(preference: AppThemePreference | null): void {
  if (typeof window === 'undefined') {
    return;
  }

  const nextPreference = preference ?? 'system';
  window.dispatchEvent(
    new CustomEvent(THEME_PREFERENCE_CHANGE_EVENT, {
      detail: { preference: nextPreference, theme: resolveAppTheme(nextPreference) },
    })
  );
}

export function createThemePreferenceService(): ThemePreferenceService {
  const service = createStorageBackedPreferenceService<
    AppThemePreference | null,
    AppThemePreference
  >({
    canObserveBrowserStorageChanges: canObserveThemeStorageChanges,
    dispatchChange: dispatchThemeChange,
    initialCurrentValue: null,
    isBrowserStorageAvailable: usesBrowserThemeStorage,
    mapCurrentToStoredPreference: (preference) => preference,
    mapStoredPreferenceToCurrent: (preference) => preference,
    normalizeStoredPreference: normalizeStoredThemePreference,
    readLocalStoragePreference: readLocalStorageThemePreference,
    storageArea: THEME_STORAGE_AREA,
    storageKey: THEME_STORAGE_KEY,
    writeLocalStoragePreference: writeLocalStorageThemePreference,
  });

  return {
    ensureHydrated: () => service.ensureHydrated(),
    getStoredPreference: () => service.getStoredPreference(),
    setPreference: (preference) => {
      return service.setPreference(preference);
    },
    subscribe: (listener) => service.subscribe(listener),
  };
}
