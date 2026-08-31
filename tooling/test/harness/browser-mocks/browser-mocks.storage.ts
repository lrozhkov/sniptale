import {
  ChromeEvent,
  getStoredItemsSnapshot,
  removeStoredItems,
  setStoredItems,
  toStoredObject,
} from './browser-mocks.shared';

type HarnessStorageChangeEvent = ChromeEvent<
  [Record<string, chrome.storage.StorageChange>, chrome.storage.AreaName]
>;

type StorageAreaMock = {
  get: (
    keys: string[] | Record<string, unknown> | string | null,
    callback?: (result: Record<string, unknown>) => void
  ) => Promise<Record<string, unknown>> | void;
  set: (items: Record<string, unknown>, callback?: () => void) => Promise<void>;
  remove: (keys: string[] | string, callback?: () => void) => Promise<void>;
};

function getAreaState(
  storageAreas: Map<chrome.storage.AreaName, Map<string, unknown>>,
  areaName: chrome.storage.AreaName
): Map<string, unknown> {
  const existing = storageAreas.get(areaName);
  if (existing) {
    return existing;
  }

  const nextArea = new Map<string, unknown>();
  storageAreas.set(areaName, nextArea);
  return nextArea;
}

function getAreaStorageResult(
  area: Map<string, unknown>,
  keys: string[] | Record<string, unknown> | string | null
): Record<string, unknown> {
  if (keys == null) {
    return Object.fromEntries(area.entries());
  }

  if (typeof keys === 'string') {
    return { [keys]: area.get(keys) };
  }

  if (Array.isArray(keys)) {
    return Object.fromEntries(keys.map((key) => [key, area.get(key)]));
  }

  return Object.fromEntries(Object.keys(keys).map((key) => [key, area.get(key) ?? keys[key]]));
}

function createHarnessStorageArea(args: {
  areaName: chrome.storage.AreaName;
  storageAreas: Map<chrome.storage.AreaName, Map<string, unknown>>;
  storageOnChanged: HarnessStorageChangeEvent;
}) {
  return {
    get: (
      keys: string[] | Record<string, unknown> | string | null,
      callback?: (result: Record<string, unknown>) => void
    ) => {
      const result = getAreaStorageResult(getAreaState(args.storageAreas, args.areaName), keys);
      callback?.(result);
      return Promise.resolve(result);
    },
    set: (items: Record<string, unknown>, callback?: () => void) => {
      const area = getAreaState(args.storageAreas, args.areaName);
      const changes = Object.fromEntries(
        Object.entries(items).map(([key, value]) => {
          const oldValue = area.get(key);
          area.set(key, value);
          return [key, { oldValue, newValue: value }];
        })
      );
      args.storageOnChanged.emit(changes, args.areaName);
      callback?.();
      return Promise.resolve();
    },
    remove: (keys: string[] | string, callback?: () => void) => {
      const area = getAreaState(args.storageAreas, args.areaName);
      const changes = Object.fromEntries(
        (Array.isArray(keys) ? keys : [keys]).map((key) => {
          const oldValue = area.get(key);
          area.delete(key);
          return [key, { oldValue, newValue: undefined }];
        })
      );
      args.storageOnChanged.emit(changes, args.areaName);
      callback?.();
      return Promise.resolve();
    },
  };
}

export function createHarnessStorageMock() {
  const storageOnChanged = new ChromeEvent<
    [Record<string, chrome.storage.StorageChange>, chrome.storage.AreaName]
  >();
  const storageAreas = new Map<chrome.storage.AreaName, Map<string, unknown>>();
  const createArea = (areaName: chrome.storage.AreaName) =>
    createHarnessStorageArea({ areaName, storageAreas, storageOnChanged });

  return {
    onChanged: storageOnChanged,
    local: createArea('local'),
    sync: createArea('sync'),
    session: createArea('session'),
    managed: createArea('managed'),
  };
}

export function attachHarnessStorageArea(
  area: StorageAreaMock,
  areaName: chrome.storage.AreaName,
  storageOnChanged: HarnessStorageChangeEvent
) {
  area.get = (
    keys: string[] | Record<string, unknown> | string | null,
    callback?: (result: Record<string, unknown>) => void
  ) => {
    const result = toStoredObject(keys);
    callback?.(result);
    return Promise.resolve(result);
  };
  area.set = (items: Record<string, unknown>, callback?: () => void) => {
    const storageState = getStoredItemsSnapshot();
    const changes = Object.fromEntries(
      Object.entries(items).map(([key, value]) => [
        key,
        { oldValue: storageState[key], newValue: value },
      ])
    );
    setStoredItems(items);
    storageOnChanged.emit(changes, areaName);
    callback?.();
    return Promise.resolve();
  };
  area.remove = (keys: string[] | string, callback?: () => void) => {
    const storageState = getStoredItemsSnapshot();
    const changes = Object.fromEntries(
      (Array.isArray(keys) ? keys : [keys]).map((key) => [
        key,
        { oldValue: storageState[key], newValue: undefined },
      ])
    );
    removeStoredItems(keys);
    storageOnChanged.emit(changes, areaName);
    callback?.();
    return Promise.resolve();
  };
}
