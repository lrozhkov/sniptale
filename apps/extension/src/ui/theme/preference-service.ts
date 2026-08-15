import { THEME_PREFERENCE_CHANGE_EVENT } from '@sniptale/ui/branding';
import { browserStorage } from '../../composition/persistence/infrastructure/browser-storage';
import { createStorageBackedPreferenceService } from '../../composition/persistence/infrastructure/preference-service';
import type { AppThemePreference } from '@sniptale/ui/theme/types';
import { runWithPersistenceMutationPermit } from '../../composition/persistence/infrastructure/mutation-barrier';
import { normalizeStoredThemePreference, resolveAppTheme, THEME_STORAGE_KEY } from './paint-hint';

const THEME_STORAGE_AREA: chrome.storage.AreaName = 'local';

interface ThemePreferenceService {
  ensureHydrated(): Promise<void>;
  getStoredPreference(): AppThemePreference | null;
  setPreference(preference: AppThemePreference): Promise<void>;
  subscribe(listener: (preference: AppThemePreference | null) => void): () => void;
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

export function readThemePaintHint(): AppThemePreference | null {
  if (typeof window === 'undefined') return null;

  try {
    return normalizeStoredThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return null;
  }
}

function persistThemePaintHint(preference: AppThemePreference): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  return runWithPersistenceMutationPermit(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  });
}

export function reconcileThemePaintHint(): Promise<AppThemePreference | null> {
  return runWithPersistenceMutationPermit(async () => {
    const preference = usesBrowserThemeStorage()
      ? normalizeStoredThemePreference(
          (await browserStorage.local.get([THEME_STORAGE_KEY]))[THEME_STORAGE_KEY]
        )
      : readThemePaintHint();

    if (typeof window === 'undefined') return preference;
    if (preference === null) window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    return preference;
  });
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
    readLocalStoragePreference: readThemePaintHint,
    storageArea: THEME_STORAGE_AREA,
    storageKey: THEME_STORAGE_KEY,
    writeLocalStoragePreference: persistThemePaintHint,
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
