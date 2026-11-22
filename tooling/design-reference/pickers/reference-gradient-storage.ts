type SyncChanges = Record<string, { oldValue: unknown; newValue: unknown }>;
type Listener = (changes: SyncChanges, area: 'sync') => void;

const values = new Map<string, unknown>();
const listeners = new Set<Listener>();

export const browserStorage = {
  sync: {
    async get(keys: readonly string[]) {
      return Object.fromEntries(keys.map((key) => [key, structuredClone(values.get(key))]));
    },
    async set(items: Record<string, unknown>) {
      const changes: SyncChanges = {};
      for (const [key, value] of Object.entries(items)) {
        changes[key] = {
          oldValue: structuredClone(values.get(key)),
          newValue: structuredClone(value),
        };
        values.set(key, structuredClone(value));
      }
      listeners.forEach((listener) => listener(changes, 'sync'));
    },
  },
  canObserveChanges: () => true,
  subscribeToChanges(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
