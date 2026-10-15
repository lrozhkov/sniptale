import { initDB } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core';
import { collectOrphanAssetObjectsDuringIdle } from '../../../../apps/extension/src/composition/persistence/asset-publication-recovery/audit';
import { listAssetObjectIds } from '../../../../apps/extension/src/composition/persistence/assets/opfs-store';

/** Real IndexedDB, OPFS and Web Locks; no retention/storage adapter substitutions. */
export async function probe() {
  const db = await initDB();
  const root = await navigator.storage.getDirectory();
  const assets = await root.getDirectoryHandle('sniptale-assets', { create: true });
  const objects = await assets.getDirectoryHandle('objects', { create: true });
  const write = async (id: string) => {
    const file = await objects.getFileHandle(id, { create: true });
    const sink = await file.createWritable();
    await sink.write('data');
    await sink.close();
  };
  await write('retained');
  await db.put('asset_refs', {
    assetId: 'retained',
    createdAt: 1,
    location: { kind: 'opfs', objectKey: 'objects/retained' },
    mimeType: 'video/webm',
    sha256: null,
    size: 4,
  });
  await db.put('asset_owners', {
    assetId: 'retained',
    ownerId: 'recording-0',
    ownerKind: 'recording',
    role: 'body',
  });
  const tx = db.transaction('recordings', 'readwrite');
  for (let i = 0; i < 1000; i++)
    await tx.store.put({
      id: `recording-${i}`,
      assetId: 'retained',
      createdAt: 1,
      filename: 'recording.webm',
      mimeType: 'video/webm',
      size: 4,
    });
  await tx.done;
  const original = IDBObjectStore.prototype.getAll;
  let reads = 0;
  IDBObjectStore.prototype.getAll = function (query, count) {
    reads++;
    return original.call(this, query, count);
  };
  let ticks = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  try {
    await collectOrphanAssetObjectsDuringIdle(new AbortController().signal);
    const idleReads = reads;
    for (let i = 0; i < 12; i++) await write(`orphan-${i}`);
    timer = setInterval(() => ticks++, 0);
    await collectOrphanAssetObjectsDuringIdle(new AbortController().signal);
    const batchReads = reads - idleReads;
    const remaining = await listAssetObjectIds();
    const intents = await db.count('asset_operations');
    return { idleReads, batchReads, ticks, remaining, intents };
  } finally {
    clearInterval(timer);
    IDBObjectStore.prototype.getAll = original;
  }
}
