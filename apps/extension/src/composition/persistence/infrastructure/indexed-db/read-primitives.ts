export function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object';
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function parseDbEntries<T>(
  values: unknown[],
  parseEntry: (value: unknown) => T | null
): T[] {
  return values.flatMap((value) => {
    const parsedEntry = parseEntry(value);
    return parsedEntry ? [parsedEntry] : [];
  });
}

const INDEXED_DB_READ_BATCH_SIZE = 512;

/**
 * Read bounded pages in the caller's transaction. Callbacks must use only that transaction's requests.
 * Return false from the callback to stop traversal.
 */
export async function visitIndexedDbStoreRows(
  store: {
    getAll(query?: IDBKeyRange, count?: number): Promise<unknown[]>;
    getAllKeys(query?: IDBKeyRange, count?: number): Promise<IDBValidKey[]>;
  },
  visit: (row: unknown) => boolean | Promise<boolean>
): Promise<void> {
  let range: IDBKeyRange | undefined;
  while (true) {
    const rows = await store.getAll(range, INDEXED_DB_READ_BATCH_SIZE);
    const keys =
      rows.length < INDEXED_DB_READ_BATCH_SIZE
        ? []
        : await store.getAllKeys(range, INDEXED_DB_READ_BATCH_SIZE);
    for (const row of rows) {
      if (!(await visit(row))) return;
    }
    if (rows.length < INDEXED_DB_READ_BATCH_SIZE) return;
    const lastKey = keys.at(-1);
    if (lastKey === undefined) return;
    range = IDBKeyRange.lowerBound(lastKey, true);
  }
}
