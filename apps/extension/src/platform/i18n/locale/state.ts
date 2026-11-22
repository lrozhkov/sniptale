import { LOCALE_CHANGE_EVENT } from '@sniptale/ui/branding';
import { browserStorage } from '../../../composition/persistence/infrastructure/browser-storage';
import { createLazyDefaultOwner } from '@sniptale/foundation/default-owner';
import {
  createStorageBackedPreferenceService,
  initializeBrowserStoredPreference,
} from '../../../composition/persistence/infrastructure/preference-service';
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from '@sniptale/platform/i18n/config';
import {
  runWithPersistenceMutationPermit,
  runWithPersistenceMutationTransition,
} from '../../../composition/persistence/infrastructure/mutation-barrier';
import { createCatalogStore } from '../catalog-store';
import { loadCatalogMessages } from '../catalog-transport';
import type { CatalogProfile } from '../catalog-profiles';

// Keep the persisted storage key stable so existing user locale preferences survive the rename.
const LOCALE_STORAGE_KEY = 'sniptale-locale-preference';
const LOCALE_STORAGE_AREA: chrome.storage.AreaName = 'local';

interface LocaleStateService {
  ensureHydrated(): Promise<void>;
  getCurrentLocale(): AppLocale;
  getStoredPreference(): AppLocale | null;
  setPreference(locale: AppLocale): Promise<void>;
  subscribe(listener: (locale: AppLocale) => void): () => void;
  prepare(profile: CatalogProfile, locale?: AppLocale): Promise<void>;
  read(locale: AppLocale, key: string): string;
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
    return isAppLocale(value) ? value : null;
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

function reconcileLocalePaintHint(): Promise<AppLocale | null> {
  return runWithPersistenceMutationPermit(async () => {
    const locale = usesBrowserLocaleStorage()
      ? normalizeStoredLocale(
          (await browserStorage.local.get([LOCALE_STORAGE_KEY]))[LOCALE_STORAGE_KEY]
        )
      : readLocalStorageLocale();

    if (typeof window === 'undefined') return locale;
    if (locale === null) window.localStorage.removeItem(LOCALE_STORAGE_KEY);
    else window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    return locale;
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
  return isAppLocale(value) ? value : null;
}

function createLocaleStateService(): LocaleStateService {
  const catalogs = createCatalogStore({
    fallbackLocale: DEFAULT_LOCALE,
    load: loadCatalogMessages,
  });
  const profiles = new Set<CatalogProfile>();
  let readyLocale: AppLocale | null = null;
  let preferenceIntent = 0;
  const service = createStorageBackedPreferenceService<AppLocale, AppLocale>({
    dispatchChange: dispatchLocaleChange,
    initialCurrentValue: readLocalStorageLocale() ?? DEFAULT_LOCALE,
    isBrowserStorageAvailable: usesBrowserLocaleStorage,
    mapCurrentToStoredPreference: (locale) => locale,
    mapStoredPreferenceToCurrent: (locale) => locale ?? DEFAULT_LOCALE,
    normalizeStoredPreference: normalizeStoredLocale,
    readLocalStoragePreference: readLocalStorageLocale,
    storageArea: LOCALE_STORAGE_AREA,
    storageKey: LOCALE_STORAGE_KEY,
    writeLocalStoragePreference: writeLocalStorageLocale,
  });

  async function prepareCurrentProfiles(): Promise<void> {
    const selected = service.getCurrentValue();
    await catalogs.prepare(selected, [...profiles]);
    if (service.getCurrentValue() !== selected) {
      await prepareCurrentProfiles();
      return;
    }
    readyLocale = selected;
  }

  return {
    ensureHydrated: async () => {
      await service.ensureHydrated();
      await reconcileLocalePaintHint();
      await prepareCurrentProfiles();
    },
    getCurrentLocale: () => readyLocale ?? service.getCurrentValue(),
    getStoredPreference: () => service.getStoredPreference(),
    setPreference: (locale) => {
      const intent = ++preferenceIntent;
      return runWithPersistenceMutationTransition(async () => {
        await catalogs.prepare(locale, [...profiles]);
        if (intent !== preferenceIntent) return;
        await service.setPreference(locale);
        await reconcileLocalePaintHint();
        if (intent === preferenceIntent && service.getCurrentValue() === locale)
          readyLocale = locale;
      });
    },
    prepare: async (profile, locale) => {
      profiles.add(profile);
      if (locale !== undefined) {
        await catalogs.prepare(locale, [profile]);
        return;
      }
      await service.ensureHydrated();
      await prepareCurrentProfiles();
    },
    read: (locale, key) => catalogs.read(locale, key),
    subscribe: (listener) => {
      let active = true;
      let reconciliationIntent = 0;
      const dispose = service.subscribe((locale) => {
        const intent = ++reconciliationIntent;
        void reconcileLocalePaintHint()
          .then(async (authoritativeLocale) => {
            const selected = authoritativeLocale ?? DEFAULT_LOCALE;
            await catalogs.prepare(selected, [...profiles]);
            if (
              active &&
              intent === reconciliationIntent &&
              service.getCurrentValue() === selected
            ) {
              readyLocale = selected;
              listener(selected);
            }
          })
          .catch(() => {
            if (active && intent === reconciliationIntent && profiles.size === 0) listener(locale);
          });
      });

      return () => {
        active = false;
        reconciliationIntent += 1;
        dispose();
      };
    },
  };
}

const defaultLocaleStateService = createLazyDefaultOwner(createLocaleStateService);

export function getStoredLocalePreference(): AppLocale | null {
  return defaultLocaleStateService.getOwner().getStoredPreference();
}

export function getCurrentLocale(): AppLocale {
  return defaultLocaleStateService.getOwner().getCurrentLocale();
}

export function ensureLocaleHydrated(): Promise<void> {
  return defaultLocaleStateService.getOwner().ensureHydrated();
}

export async function initializeLocalePreference(): Promise<void> {
  await initializeBrowserStoredPreference(LOCALE_STORAGE_KEY, DEFAULT_LOCALE);
  // Hydration can reconcile the paint hint through a shared persistence permit.
  // Release the exclusive permit before entering that path.
  await ensureLocaleHydrated();
}

export function setLocalePreference(locale: AppLocale): Promise<void> {
  return defaultLocaleStateService.getOwner().setPreference(locale);
}

export function subscribeToLocaleChanges(listener: (locale: AppLocale) => void): () => void {
  return defaultLocaleStateService.getOwner().subscribe(listener);
}

/** Prepare local language data before the surface can use its synchronous translator. */
export function prepareTranslations(profile: CatalogProfile, locale?: AppLocale): Promise<void> {
  return defaultLocaleStateService.getOwner().prepare(profile, locale);
}

/** Read only catalog data that the runtime has already prepared. */
export function readPreparedTranslation(locale: AppLocale, key: string): string {
  return defaultLocaleStateService.getOwner().read(locale, key);
}
