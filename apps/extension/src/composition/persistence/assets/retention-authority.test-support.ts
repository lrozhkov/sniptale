import { vi } from 'vitest';

/** Model bounded native request reads over one immutable per-store fixture snapshot. */
export function createRetentionDatabaseFixture(readRows: (store: string) => Promise<unknown[]>) {
  const fullRead = vi.fn(async (store: string) => readRows(store));
  const abort = vi.fn();
  const pages = vi.fn();
  const transaction = vi.fn((names: string[]) => {
    const name = names[0];
    if (!name) throw new Error('Missing fixture store');
    const snapshot = readRows(name).then((rows) => structuredClone(rows));
    const read = async (range: unknown, count: number | undefined, keys: boolean) => {
      pages(name, range, count, keys);
      if (count !== 64) throw new Error('Unbounded fixture request');
      const lower =
        typeof range === 'object' &&
        range !== null &&
        'lower' in range &&
        typeof range.lower === 'number'
          ? range.lower
          : -1;
      const rows = await snapshot;
      return keys
        ? rows.map((_, index) => index).slice(lower + 1, lower + 1 + count)
        : rows.slice(lower + 1, lower + 1 + count);
    };
    return {
      done: Promise.resolve(),
      abort,
      objectStore: () => ({
        getAll: (range?: unknown, count?: number) => read(range, count, false),
        getAllKeys: (range?: unknown, count?: number) => read(range, count, true),
      }),
    };
  });
  const result = { getAll: fullRead, transaction, pages, abort };
  return result;
}
