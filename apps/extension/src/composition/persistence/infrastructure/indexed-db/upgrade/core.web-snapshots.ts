import { MEDIA_LIBRARY_STORE, THUMBNAILS_STORE, WEB_SNAPSHOTS_STORE } from '../core.stores.ts';
import type { UpgradeObjectStore, UpgradeTransaction } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readId(value: unknown): string | null {
  return isRecord(value) && typeof value['id'] === 'string' && value['id'].length > 0
    ? value['id']
    : null;
}

function isWebSnapshotMedia(value: unknown): boolean {
  return (
    isRecord(value) &&
    isRecord(value['source']) &&
    value['source']['kind'] === 'web-snapshot' &&
    typeof value['source']['snapshotId'] === 'string'
  );
}

async function deleteKeys(store: UpgradeObjectStore, keys: Iterable<IDBValidKey>): Promise<void> {
  for (const key of keys) await store.delete(key);
}

export async function applyWebSnapshotsV30Upgrade(
  oldVersion: number,
  transaction?: UpgradeTransaction
): Promise<void> {
  if (oldVersion >= 30 || oldVersion === 0) return;
  if (!transaction) throw new Error('Web snapshot upgrade transaction is unavailable.');
  const snapshotStore = transaction.objectStore(WEB_SNAPSHOTS_STORE);
  const mediaStore = transaction.objectStore(MEDIA_LIBRARY_STORE);
  const mediaEntries = await mediaStore.getAll();
  const mediaIds = mediaEntries.flatMap((entry) => {
    if (!isWebSnapshotMedia(entry)) return [];
    const id = readId(entry);
    return id ? [id] : [];
  });
  await snapshotStore.clear();
  await deleteKeys(mediaStore, mediaIds);
  await deleteKeys(transaction.objectStore(THUMBNAILS_STORE), mediaIds);
}
