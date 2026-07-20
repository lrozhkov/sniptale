import { createLogger } from '@sniptale/platform/observability/logger';
import {
  isExpiredBootstrapEntry,
  parseRetainedBootstrapEntry,
  readPersistedBootstrapId,
  type RetainedEditorBootstrapEntry,
} from './retention-entry';

const EDITOR_BOOTSTRAP_MAX_ENTRIES = 10;
const EDITOR_BOOTSTRAP_MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const logger = createLogger({ namespace: 'SharedEditorBootstrapRetention' });

interface RetentionCleanupStore {
  delete(storeName: string, key: string): Promise<void>;
  getAll(storeName: string): Promise<unknown[]>;
  getAllKeys(storeName: string): Promise<IDBValidKey[]>;
}

function getBootstrapEntrySize(entry: RetainedEditorBootstrapEntry): number {
  return JSON.stringify(entry).length;
}

function collectInvalidOrExpiredEntryIds(
  entries: readonly unknown[],
  keys: readonly IDBValidKey[],
  now: number
): { idsToDelete: Set<string>; retainedEntries: RetainedEditorBootstrapEntry[] } {
  const retainedEntries: RetainedEditorBootstrapEntry[] = [];
  const idsToDelete = new Set<string>();

  entries.forEach((rawEntry, index) => {
    const entry = parseRetainedBootstrapEntry(rawEntry);
    if (!entry) {
      const bootstrapId = readPersistedBootstrapId(rawEntry, keys[index]);
      logger.warn('Deleting invalid editor bootstrap payload from IndexedDB', { bootstrapId });
      if (bootstrapId) {
        idsToDelete.add(bootstrapId);
      }
      return;
    }

    if (isExpiredBootstrapEntry(entry, now)) {
      idsToDelete.add(entry.id);
      return;
    }

    retainedEntries.push(entry);
  });

  return { idsToDelete, retainedEntries };
}

function addEntriesOverRetentionCaps(
  idsToDelete: Set<string>,
  retainedEntries: readonly RetainedEditorBootstrapEntry[]
): void {
  const newestFirst = [...retainedEntries].sort((left, right) => right.createdAt - left.createdAt);
  const keptIds = new Set<string>();
  let totalBytes = 0;

  for (const entry of newestFirst) {
    const nextTotalBytes = totalBytes + getBootstrapEntrySize(entry);
    if (
      keptIds.size >= EDITOR_BOOTSTRAP_MAX_ENTRIES ||
      nextTotalBytes > EDITOR_BOOTSTRAP_MAX_TOTAL_BYTES
    ) {
      idsToDelete.add(entry.id);
      continue;
    }

    keptIds.add(entry.id);
    totalBytes = nextTotalBytes;
  }
}

export async function cleanupRetainedBootstrapEntries(
  db: RetentionCleanupStore,
  storeName: string,
  now = Date.now()
): Promise<number> {
  const [entries, keys] = await Promise.all([db.getAll(storeName), db.getAllKeys(storeName)]);
  const { idsToDelete, retainedEntries } = collectInvalidOrExpiredEntryIds(entries, keys, now);

  addEntriesOverRetentionCaps(idsToDelete, retainedEntries);
  await Promise.all(Array.from(idsToDelete, (bootstrapId) => db.delete(storeName, bootstrapId)));
  return idsToDelete.size;
}
