export type PreferenceChangeListener<TCurrent> = (value: TCurrent) => void;

export type StorageBackedPreferenceBackend = 'browser' | 'local';

export type StorageBackedPreferenceState<TCurrent> = {
  backend: StorageBackedPreferenceBackend | null;
  currentValue: TCurrent;
  hydrated: boolean;
  hydrationPromise: Promise<void> | null;
  listeners: Set<PreferenceChangeListener<TCurrent>>;
  storageListenerCleanup: (() => void) | null;
};

export type ApplyPreferenceOptions = {
  notify?: boolean;
};

export interface StorageBackedPreferenceService<TCurrent, TStored extends string> {
  ensureHydrated(): Promise<void>;
  getCurrentValue(): TCurrent;
  getStoredPreference(): TStored | null;
  setPreference(value: TStored): Promise<void>;
  subscribe(listener: PreferenceChangeListener<TCurrent>): () => void;
}

export interface CreateStorageBackedPreferenceServiceArgs<TCurrent, TStored extends string> {
  canObserveBrowserStorageChanges?: () => boolean;
  dispatchChange?: (value: TCurrent) => void;
  initialCurrentValue: TCurrent;
  isBrowserStorageAvailable: () => boolean;
  mapCurrentToStoredPreference: (value: TCurrent) => TStored | null;
  mapStoredPreferenceToCurrent: (value: TStored | null, currentValue: TCurrent) => TCurrent;
  normalizeStoredPreference: (value: unknown) => TStored | null;
  readLocalStoragePreference: () => TStored | null;
  storageArea: chrome.storage.AreaName;
  storageKey: string;
  writeLocalStoragePreference: (value: TStored) => Promise<void> | void;
}
