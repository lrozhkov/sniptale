import { createBrowserStorageStateDomainAdapter } from '../browser-storage-state-domain-adapter';
import { stateManager } from '../state-manager';
import type {
  BrowserStorageAreaAdapter,
  BrowserStorageGetKeys,
} from '@sniptale/platform/browser/storage-types';
import { runWithPersistenceMutationPermit } from '../mutation-barrier';

function getStorageArea(areaName: chrome.storage.AreaName): chrome.storage.StorageArea | null {
  if (typeof chrome === 'undefined') {
    return null;
  }
  return chrome.storage?.[areaName] ?? null;
}

function getStateManagerDomain(areaName: chrome.storage.AreaName): string {
  return `browser.storage.${areaName}`;
}

for (const areaName of ['local', 'sync', 'session'] as const) {
  stateManager.registerDomain(getStateManagerDomain(areaName), {
    adapter: createBrowserStorageStateDomainAdapter(areaName, () => getStorageArea(areaName)),
  });
}

function normalizeStorageKeys(keys: BrowserStorageGetKeys): string[] | null {
  if (keys === undefined || keys === null) {
    return null;
  }
  if (typeof keys === 'string') {
    return [keys];
  }
  if (Array.isArray(keys)) {
    return keys;
  }
  return Object.keys(keys);
}

async function materializeStorageValues(
  areaName: chrome.storage.AreaName,
  keys: BrowserStorageGetKeys
): Promise<Record<string, unknown>> {
  const domain = getStateManagerDomain(areaName);
  const normalizedKeys = normalizeStorageKeys(keys);
  if (!normalizedKeys) {
    return stateManager.hydrate(domain);
  }

  const defaults = keys !== null && typeof keys === 'object' && !Array.isArray(keys) ? keys : {};
  const entries = await Promise.all(
    normalizedKeys.map(async (key) => {
      const value = await stateManager.read(domain, key);
      return [key, value === undefined ? defaults[key] : value] as const;
    })
  );

  return Object.fromEntries(entries.filter(([, value]) => value !== undefined));
}

export function createStorageAreaAdapter(
  areaName: chrome.storage.AreaName,
  guardMutations: boolean
): BrowserStorageAreaAdapter {
  return {
    isAvailable() {
      return getStorageArea(areaName) !== null;
    },

    get(keys?: BrowserStorageGetKeys) {
      if (!getStorageArea(areaName)) {
        return Promise.reject(new Error(`chrome.storage.${areaName} is unavailable`));
      }

      return materializeStorageValues(areaName, keys ?? null);
    },

    async set(items) {
      if (!getStorageArea(areaName)) {
        return Promise.reject(new Error(`chrome.storage.${areaName} is unavailable`));
      }

      const write = () => stateManager.writeMany(getStateManagerDomain(areaName), items);
      await (guardMutations ? runWithPersistenceMutationPermit(write) : write());
    },

    async remove(keys) {
      if (!getStorageArea(areaName)) {
        return Promise.reject(new Error(`chrome.storage.${areaName} is unavailable`));
      }

      const remove = () =>
        stateManager.removeMany(
          getStateManagerDomain(areaName),
          Array.isArray(keys) ? keys : [keys]
        );
      await (guardMutations ? runWithPersistenceMutationPermit(remove) : remove());
    },
  };
}
