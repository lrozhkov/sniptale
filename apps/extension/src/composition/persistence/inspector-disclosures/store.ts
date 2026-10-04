import type { BrowserStorageAreaAdapter } from '@sniptale/platform/browser/storage-types';
import { browserStorage } from '../infrastructure/browser-storage';

const PREFIX = 'sniptale_inspector_disclosure_v1:';
type Entry = { value: boolean | undefined; version: number };

/** Advisory interface choices: per-type keys, never project content or object identifiers. */
export function createInspectorDisclosureStore(
  storage: Pick<BrowserStorageAreaAdapter, 'get' | 'set'> = browserStorage.local
) {
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  let writes = Promise.resolve();
  const notify = () => listeners.forEach((listener) => listener());
  const storageKey = (key: string) => PREFIX + key;
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    read(key: string) {
      return entries.get(key)?.value;
    },
    async load(key: string) {
      if (entries.has(key)) return;
      const entry: Entry = { value: undefined, version: 0 };
      entries.set(key, entry);
      try {
        const values = await storage.get([storageKey(key)]);
        const value: unknown = values[storageKey(key)];
        if (entry.version === 0 && typeof value === 'boolean') {
          entry.value = value;
          notify();
        }
      } catch {
        // Advisory preference failure keeps the component's default and remains editable.
      }
    },
    set(key: string, value: boolean) {
      const entry = entries.get(key) ?? { value: undefined, version: 0 };
      entry.value = value;
      entry.version += 1;
      entries.set(key, entry);
      notify();
      // Preserve user click order; separate keys cannot overwrite another group's choice.
      writes = writes
        .then(() => storage.set({ [storageKey(key)]: value }))
        .catch(() => {
          // On failure the current inspector retains its choice; restart may use the stored value.
        });
      return writes;
    },
  };
}
