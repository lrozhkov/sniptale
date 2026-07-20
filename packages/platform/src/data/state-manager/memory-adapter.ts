import type { StateDomainAdapter } from './types';

export function createMemoryStateDomainAdapter(
  entries: Iterable<readonly [string, unknown]> = []
): StateDomainAdapter {
  const values = new Map<string, unknown>(entries);

  return {
    async clear() {
      values.clear();
    },
    async hydrate() {
      return Object.fromEntries(values.entries());
    },
    async read(key) {
      return values.get(key);
    },
    async remove(key) {
      values.delete(key);
    },
    async removeMany(keys) {
      keys.forEach((key) => values.delete(key));
    },
    async write(key, value) {
      values.set(key, value);
    },
    async writeMany(nextValues) {
      Object.entries(nextValues).forEach(([key, value]) => values.set(key, value));
    },
  };
}
