import { initDB, VIDEO_EFFECT_BUNDLES_STORE } from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import type { ImportedEffectArtifact } from '../../../features/video/project/effect-bundle/import/artifact';
import type {
  EffectBundleCatalogEntry,
  EffectBundleCatalogListItem,
} from '../../../features/video/project/effect-bundle/catalog';
import { createEffectCatalogEntry } from './catalog-builder';
import { parseEffectBundleCatalogEntry } from './entry';
import { EffectBundlePersistenceError } from './errors';
import {
  assertEffectBundleCatalogIntegrity,
  assertEffectBundleCatalogRetainedBytes,
} from './integrity';

export { EffectBundlePersistenceError } from './errors';

export const EFFECT_BUNDLE_CATALOG_RETAINED_BYTES_LIMIT = 512 * 1024 * 1024;
const STORAGE_HEADROOM_BYTES = 64 * 1024 * 1024;

export async function saveEffectArtifact(
  artifact: ImportedEffectArtifact,
  now = Date.now()
): Promise<EffectBundleCatalogEntry> {
  const draft = await createEffectCatalogEntry(artifact, now);
  const storageEstimate = await readStorageEstimate();
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(VIDEO_EFFECT_BUNDLES_STORE, 'readwrite');
    const store = tx.objectStore(VIDEO_EFFECT_BUNDLES_STORE);
    const existingValue: unknown = await store.get(draft.packId);
    const existing =
      existingValue === undefined ? null : parseEffectBundleCatalogEntry(existingValue);
    if (existingValue !== undefined && !existing) {
      tx.abort();
      throw new EffectBundlePersistenceError('catalogEntryInvalid');
    }
    const entry = {
      ...draft,
      createdAt: existing?.createdAt ?? now,
      enabled: existing?.enabled ?? true,
    };
    const allEntriesValue: unknown = await store.getAll();
    if (!Array.isArray(allEntriesValue)) {
      tx.abort();
      throw new EffectBundlePersistenceError('catalogEntryInvalid');
    }
    const allEntries: unknown[] = allEntriesValue;
    const currentRetainedBytes = allEntries.reduce<number>((total, value) => {
      const parsed = parseEffectBundleCatalogEntry(value);
      if (!parsed) throw new EffectBundlePersistenceError('catalogEntryInvalid');
      return total + assertEffectBundleCatalogRetainedBytes(parsed);
    }, 0);
    const existingRetainedBytes = existing ? assertEffectBundleCatalogRetainedBytes(existing) : 0;
    const nextRetainedBytes =
      currentRetainedBytes - existingRetainedBytes + entry.retainedByteLength;
    assertStorageHeadroom(nextRetainedBytes, currentRetainedBytes, storageEstimate);
    await store.put(entry);
    await tx.done;
    return entry;
  });
}

export async function listEffectBundles(): Promise<EffectBundleCatalogListItem[]> {
  const db = await initDB();
  const valuesValue: unknown = await db.getAll(VIDEO_EFFECT_BUNDLES_STORE);
  if (!Array.isArray(valuesValue)) {
    throw new EffectBundlePersistenceError('catalogEntryInvalid');
  }
  const values: unknown[] = valuesValue;
  const summaries: EffectBundleCatalogListItem[] = [];
  for (const value of values) {
    const entry = parseEffectBundleCatalogEntry(value);
    if (!entry) {
      summaries.push({ packId: readOpaquePackId(value), status: 'invalid' });
      continue;
    }
    try {
      await assertEffectBundleCatalogIntegrity(entry);
      summaries.push({
        createdAt: entry.createdAt,
        documentKinds: entry.documents.map(({ kind }) => kind),
        enabled: entry.enabled,
        entry,
        label: entry.label,
        packId: entry.packId,
        retainedByteLength: entry.retainedByteLength,
        source: entry.source,
        status: 'ready',
        updatedAt: entry.updatedAt,
        version: entry.version,
      });
    } catch {
      summaries.push({ packId: entry.packId, status: 'invalid' });
    }
  }
  return summaries.sort((left, right) =>
    left.status === 'ready' && right.status === 'ready' ? right.updatedAt - left.updatedAt : 0
  );
}

export async function getEffectBundle(packId: string): Promise<EffectBundleCatalogEntry | null> {
  const db = await initDB();
  const value: unknown = await db.get(VIDEO_EFFECT_BUNDLES_STORE, packId);
  if (value === undefined) return null;
  const entry = parseEffectBundleCatalogEntry(value);
  if (!entry) throw new EffectBundlePersistenceError('catalogEntryInvalid');
  await assertEffectBundleCatalogIntegrity(entry);
  return entry;
}

export async function deleteEffectBundle(packId: string): Promise<void> {
  await runWithIndexedDbMutation((db) => db.delete(VIDEO_EFFECT_BUNDLES_STORE, packId));
}

export async function setEffectBundleEnabled(packId: string, enabled: boolean): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const verifiedValue: unknown = await db.get(VIDEO_EFFECT_BUNDLES_STORE, packId);
    if (verifiedValue === undefined) return;
    const verifiedEntry = parseEffectBundleCatalogEntry(verifiedValue);
    if (!verifiedEntry) throw new EffectBundlePersistenceError('catalogEntryInvalid');
    await assertEffectBundleCatalogIntegrity(verifiedEntry);

    const tx = db.transaction(VIDEO_EFFECT_BUNDLES_STORE, 'readwrite');
    const store = tx.objectStore(VIDEO_EFFECT_BUNDLES_STORE);
    const currentValue: unknown = await store.get(packId);
    const currentEntry = parseEffectBundleCatalogEntry(currentValue);
    if (!currentEntry || !hasSameCatalogMutationIdentity(verifiedEntry, currentEntry)) {
      tx.abort();
      throw new EffectBundlePersistenceError('catalogIntegrityFailure');
    }
    await store.put({ ...currentEntry, enabled, updatedAt: Date.now() });
    await tx.done;
  });
}

function hasSameCatalogMutationIdentity(
  verified: EffectBundleCatalogEntry,
  current: EffectBundleCatalogEntry
): boolean {
  return (
    JSON.stringify(catalogMutationIdentity(verified)) ===
    JSON.stringify(catalogMutationIdentity(current))
  );
}

function catalogMutationIdentity(entry: EffectBundleCatalogEntry) {
  return {
    assets: entry.assets.map(({ blob, ...asset }) => ({
      ...asset,
      blobSize: blob.size,
      blobType: blob.type,
    })),
    createdAt: entry.createdAt,
    description: entry.description,
    documents: entry.documents,
    enabled: entry.enabled,
    label: entry.label,
    packId: entry.packId,
    retainedByteLength: entry.retainedByteLength,
    source: entry.source,
    sourceSha256: entry.sourceSha256,
    updatedAt: entry.updatedAt,
    version: entry.version,
  };
}

function assertStorageHeadroom(
  nextRetainedBytes: number,
  currentRetainedBytes: number,
  estimate: StorageEstimate | undefined
): void {
  if (nextRetainedBytes > EFFECT_BUNDLE_CATALOG_RETAINED_BYTES_LIMIT) {
    throw new EffectBundlePersistenceError('catalogQuotaExceeded');
  }
  if (
    estimate?.quota !== undefined &&
    estimate.usage !== undefined &&
    estimate.usage +
      Math.max(0, nextRetainedBytes - currentRetainedBytes) +
      STORAGE_HEADROOM_BYTES >
      estimate.quota
  ) {
    throw new EffectBundlePersistenceError('catalogQuotaExceeded');
  }
}

async function readStorageEstimate(): Promise<StorageEstimate | undefined> {
  return typeof navigator === 'undefined'
    ? undefined
    : navigator.storage?.estimate?.().catch(() => undefined);
}

function readOpaquePackId(value: unknown): string {
  return isUnknownRecord(value) && typeof value['packId'] === 'string'
    ? value['packId'].slice(0, 128)
    : 'invalid';
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
