import { runChromeCallback, runChromeVoidCallback } from '@sniptale/platform/browser/callback';
import type { StateDomainAdapter } from '@sniptale/platform/data/state-manager/types';

export interface BrowserStorageAreaPort {
  clear(callback: () => void): void;
  get(keys: unknown, callback: (value: Record<string, unknown>) => void): void;
  remove(keys: string | string[], callback: () => void): void;
  set(values: Record<string, unknown>, callback: () => void): void;
}
type StorageAreaResolver = () => BrowserStorageAreaPort | null;

function unavailableError(areaName: chrome.storage.AreaName): Error {
  return new Error(`chrome.storage.${areaName} is unavailable`);
}

function getResolvedArea(
  areaName: chrome.storage.AreaName,
  resolveArea: StorageAreaResolver
): BrowserStorageAreaPort {
  const area = resolveArea();
  if (!area) {
    throw unavailableError(areaName);
  }
  return area;
}

function getUnavailableMessage(areaName: chrome.storage.AreaName): string {
  return `chrome.storage.${areaName} is unavailable`;
}

async function clearStorageArea(
  areaName: chrome.storage.AreaName,
  area: BrowserStorageAreaPort
): Promise<void> {
  await runChromeVoidCallback((callback) => area.clear(callback), getUnavailableMessage(areaName));
}

async function hydrateStorageArea(
  areaName: chrome.storage.AreaName,
  area: BrowserStorageAreaPort
): Promise<Record<string, unknown>> {
  return runChromeCallback<Record<string, unknown>>(
    (callback) => area.get(null, callback),
    getUnavailableMessage(areaName)
  );
}

async function readStorageKey(
  areaName: chrome.storage.AreaName,
  area: BrowserStorageAreaPort,
  key: string
): Promise<unknown> {
  const result = await runChromeCallback<Record<string, unknown>>(
    (callback) => area.get([key], callback),
    getUnavailableMessage(areaName)
  );
  return result[key];
}

async function removeStorageKeys(
  areaName: chrome.storage.AreaName,
  area: BrowserStorageAreaPort,
  keys: string | readonly string[]
): Promise<void> {
  const storageKeys = typeof keys === 'string' ? keys : [...keys];
  await runChromeVoidCallback(
    (callback) => area.remove(storageKeys, callback),
    getUnavailableMessage(areaName)
  );
}

async function writeStorageValues(
  areaName: chrome.storage.AreaName,
  area: BrowserStorageAreaPort,
  values: Record<string, unknown>
): Promise<void> {
  await runChromeVoidCallback(
    (callback) => area.set(values, callback),
    getUnavailableMessage(areaName)
  );
}

export function createBrowserStorageStateDomainAdapter(
  areaName: chrome.storage.AreaName,
  resolveArea: StorageAreaResolver
): StateDomainAdapter {
  function getArea(): BrowserStorageAreaPort {
    return getResolvedArea(areaName, resolveArea);
  }

  return {
    async clear() {
      await clearStorageArea(areaName, getArea());
    },
    async hydrate() {
      return hydrateStorageArea(areaName, getArea());
    },
    async read(key) {
      return readStorageKey(areaName, getArea(), key);
    },
    async remove(key) {
      await removeStorageKeys(areaName, getArea(), key);
    },
    async removeMany(keys) {
      await removeStorageKeys(areaName, getArea(), [...keys]);
    },
    async write(key, value) {
      await writeStorageValues(areaName, getArea(), { [key]: value });
    },
    async writeMany(values) {
      await writeStorageValues(areaName, getArea(), values);
    },
  };
}
