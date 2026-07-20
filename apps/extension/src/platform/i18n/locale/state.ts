import { LOCALE_CHANGE_EVENT } from '@sniptale/ui/branding';
import { browserStorage } from '../../../composition/persistence/infrastructure/browser-storage';
import { createLazyDefaultOwner } from '@sniptale/foundation/default-owner';
import { createStorageBackedPreferenceService } from '../../../composition/persistence/infrastructure/preference-service';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type AppLocale } from '@sniptale/platform/i18n/config';
import { runWithPersistenceMutationPermit } from '../../../composition/persistence/infrastructure/mutation-barrier';

// Keep the persisted storage key stable so existing user locale preferences survive the rename.
const LOCALE_STORAGE_KEY = 'sniptale-locale-preference';
const LOCALE_STORAGE_AREA: chrome.storage.AreaName = 'local';

interface LocaleStateService {
  ensureHydrated(): Promise<void>;
  getCurrentLocale(): AppLocale;
  getStoredPreference(): AppLocale | null;
  setPreference(locale: AppLocale): Promise<void>;
  subscribe(listener: (locale: AppLocale) => void): () => void;
}

function isSupportedLocale(value: string | null): value is AppLocale {
  return value !== null && SUPPORTED_LOCALES.includes(value as AppLocale);
}

function usesBrowserLocaleStorage(): boolean {
  const localStorageArea = browserStorage.local;
  return (
    localStorageArea != null &&
    typeof localStorageArea.isAvailable === 'function' &&
    localStorageArea.isAvailable()
  );
}

function readLocalStorageLocale(): AppLocale | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const value = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isSupportedLocale(value) ? value : null;
  } catch {
    return null;
  }
}

function writeLocalStorageLocale(locale: AppLocale): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  return runWithPersistenceMutationPermit(() => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  });
}

function dispatchLocaleChange(locale: AppLocale): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<{ locale: AppLocale }>(LOCALE_CHANGE_EVENT, {
      detail: { locale },
    })
  );
}

function normalizeStoredLocale(value: unknown): AppLocale | null {
  return isSupportedLocale(typeof value === 'string' ? value : null) ? (value as AppLocale) : null;
}

function createLocaleStateService(): LocaleStateService {
  const service = createStorageBackedPreferenceService<AppLocale, AppLocale>({
    dispatchChange: dispatchLocaleChange,
    initialCurrentValue: DEFAULT_LOCALE,
    isBrowserStorageAvailable: usesBrowserLocaleStorage,
    mapCurrentToStoredPreference: (locale) => locale,
    mapStoredPreferenceToCurrent: (locale) => locale ?? DEFAULT_LOCALE,
    normalizeStoredPreference: normalizeStoredLocale,
    readLocalStoragePreference: readLocalStorageLocale,
    storageArea: LOCALE_STORAGE_AREA,
    storageKey: LOCALE_STORAGE_KEY,
    writeLocalStoragePreference: writeLocalStorageLocale,
  });

  return {
    ensureHydrated: () => service.ensureHydrated(),
    getCurrentLocale: () => service.getCurrentValue(),
    getStoredPreference: () => service.getStoredPreference(),
    setPreference: (locale) => {
      return service.setPreference(locale);
    },
    subscribe: (listener) => service.subscribe(listener),
  };
}

const defaultLocaleStateService = createLazyDefaultOwner(createLocaleStateService);

export function getStoredLocalePreference(): AppLocale | null {
  return defaultLocaleStateService.getOwner().getStoredPreference();
}

export function getCurrentLocale(): AppLocale {
  return defaultLocaleStateService.getOwner().getCurrentLocale();
}

export function setLocalePreference(locale: AppLocale): Promise<void> {
  return defaultLocaleStateService.getOwner().setPreference(locale);
}

export function subscribeToLocaleChanges(listener: (locale: AppLocale) => void): () => void {
  return defaultLocaleStateService.getOwner().subscribe(listener);
}
