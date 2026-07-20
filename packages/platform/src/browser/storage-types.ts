export type BrowserStorageGetKeys = string | string[] | Record<string, unknown> | null | undefined;

type BrowserStorageSetItems = Record<string, unknown>;
export type BrowserStorageChanges = Record<string, chrome.storage.StorageChange>;
export type BrowserStorageChangeListener = (
  changes: BrowserStorageChanges,
  areaName: chrome.storage.AreaName
) => void;

export interface BrowserStorageAreaAdapter {
  isAvailable(): boolean;
  get(keys?: BrowserStorageGetKeys): Promise<Record<string, unknown>>;
  set(items: BrowserStorageSetItems): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export interface BrowserStorageAdapter {
  local: BrowserStorageAreaAdapter;
  sync: BrowserStorageAreaAdapter;
  session: BrowserStorageAreaAdapter;
  canObserveChanges(): boolean;
  subscribeToChanges(listener: BrowserStorageChangeListener): () => void;
}
