import {
  createBuiltinEffectResources,
  readBuiltinEffectResource,
  BUILTIN_EFFECT_PREFIX,
} from './builtin';
import {
  readEffectCatalogPreferences,
  overlayEffectPreferences,
  mutateEffectCatalogPreference,
} from './preferences';
import type { PersistenceMutationPermit } from '../infrastructure/mutation-barrier';
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
      documents: draft.documents.map((document) => {
        const presetPreferences = existing?.documents.find(
          (item) => item.id === document.id
        )?.presetPreferences;
        return presetPreferences ? { ...document, presetPreferences } : document;
      }),
      createdAt: existing?.createdAt ?? now,
      enabled: existing?.enabled ?? true,
    };
    if (!parseEffectBundleCatalogEntry(entry)) {
      tx.abort();
      throw new EffectBundlePersistenceError('catalogEntryInvalid');
    }
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

export async function listImportedEffectBundles(
  permit?: PersistenceMutationPermit
): Promise<EffectBundleCatalogListItem[]> {
  const db = await initDB(permit);
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

const builtinResources = createBuiltinEffectResources(readBuiltinEffectResource);

export async function listEffectBundles(
  permit?: PersistenceMutationPermit
): Promise<EffectBundleCatalogListItem[]> {
  const [imported, builtin, preferences] = await Promise.all([
    listImportedEffectBundles(permit),
    builtinResources.load(),
    readEffectCatalogPreferences(),
  ]);
  const entries: EffectBundleCatalogListItem[] = [
    {
      createdAt: builtin.createdAt,
      documentKinds: builtin.documents.map((d) => d.kind),
      enabled: builtin.enabled,
      entry: builtin,
      label: builtin.label,
      packId: builtin.packId,
      retainedByteLength: 0,
      source: builtin.source,
      status: 'ready',
      updatedAt: builtin.updatedAt,
      version: builtin.version,
    },
    ...imported,
  ];
  return entries.map((item) =>
    item.status === 'ready'
      ? {
          ...item,
          entry: overlayEffectPreferences(item.entry, preferences),
          enabled: preferences.find((p) => p.packId === item.packId)?.enabled ?? item.enabled,
        }
      : item
  );
}

export async function getEffectBundle(packId: string): Promise<EffectBundleCatalogEntry | null> {
  if (packId.startsWith(BUILTIN_EFFECT_PREFIX)) {
    const entry = await builtinResources.load();
    return entry.packId === packId
      ? overlayEffectPreferences(entry, await readEffectCatalogPreferences())
      : null;
  }
  const db = await initDB();
  const value: unknown = await db.get(VIDEO_EFFECT_BUNDLES_STORE, packId);
  if (value === undefined) return null;
  const entry = parseEffectBundleCatalogEntry(value);
  if (!entry) throw new EffectBundlePersistenceError('catalogEntryInvalid');
  await assertEffectBundleCatalogIntegrity(entry);
  return overlayEffectPreferences(entry, await readEffectCatalogPreferences());
}

export async function deleteEffectBundle(packId: string): Promise<void> {
  if (packId.startsWith(BUILTIN_EFFECT_PREFIX))
    throw new EffectBundlePersistenceError('catalogEntryInvalid');
  await runWithIndexedDbMutation((db) => db.delete(VIDEO_EFFECT_BUNDLES_STORE, packId));
}

export async function setEffectBundleEnabled(packId: string, enabled: boolean): Promise<void> {
  if (!(await getEffectBundle(packId))) return;
  await mutateEffectCatalogPreference(packId, (current) => ({ ...current, enabled }));
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
