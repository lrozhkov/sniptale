import type { SyncCacheStatus, SyncCacheTrimResult } from '../../contracts/sync-cache';
import { initDB } from '../../composition/persistence/infrastructure/indexed-db/core';
import * as stores from '../../composition/persistence/infrastructure/indexed-db/core.stores';
import { collectDurableAssetSnapshot } from '../../composition/persistence/assets/retention-authority';
import { assetResidencyCopyId } from '../../composition/persistence/assets/residency-records';
import { readAssetResidencyRootsPageInTransaction } from '../../composition/persistence/assets/residency';
import {
  collectNativeEditingResources,
  NATIVE_EDITING_RESOURCE_STORES,
  type NativeEditingRoot,
} from '../../composition/persistence/assets/editing-resources';
import { readAssetFile, MissingAssetObjectError } from '../../composition/persistence/assets';
import { runWithAssetResourceRead } from '../../composition/persistence/assets/resource-sessions';
import { parseMediaLibraryEntry } from '../../composition/persistence/media-library/read-guards';
import { parseSyncCaptureRecord } from '../../composition/persistence/sync-capture/guards';
import { readEnabledCaptureProfile } from '../../composition/persistence/sync-capture/capture';
import type { SyncCaptureRootState } from '../../composition/persistence/sync-capture/contracts';
import {
  readNativeCacheSettings,
  releaseNativeEditingRoot,
  type NativeCacheReleaseInput,
} from './native-cache';
import type { CatalogCopyIndex } from './residency-copy';

type Database = Awaited<ReturnType<typeof initDB>>;
interface Candidate {
  id: string;
  residentBytes: number | null;
  size: number;
  lastUsedAt: number;
  pinned: boolean;
  root: NativeEditingRoot | null;
}
const ROOT_STORES = {
  media: stores.MEDIA_LIBRARY_STORE,
  'video-project': stores.VIDEO_PROJECTS_STORE,
  'video-review': stores.VIDEO_WORKSPACES_STORE,
  'scenario-project': stores.SCENARIO_PROJECTS_STORE,
};

async function exists(db: Database, root: NativeEditingRoot) {
  return (
    (await db.get(ROOT_STORES[root.rootKind], root.rootId)) !== undefined ||
    (root.rootKind === 'video-review' &&
      (await db.get(stores.MEDIA_LIBRARY_STORE, root.rootId)) !== undefined)
  );
}
async function rootResources(db: Database, root: NativeEditingRoot) {
  const tx = db.transaction([...NATIVE_EDITING_RESOURCE_STORES], 'readonly');
  const result = await collectNativeEditingResources(tx, root, 'backup');
  await tx.done;
  return [
    ...result.refs.map((ref) => assetResidencyCopyId({ kind: 'opfs', ref })),
    ...result.inlineMediaIds.map((mediaId) =>
      assetResidencyCopyId({ kind: 'inline-image', mediaId })
    ),
  ];
}
async function nativeStates(db: Database): Promise<SyncCaptureRootState[]> {
  const states: SyncCaptureRootState[] = [];
  const prefix = '["root-state",';
  let after: string | undefined;
  do {
    const tx = db.transaction([stores.SYNC_CAPTURE_STORE], 'readonly');
    const keys = await tx
      .objectStore(stores.SYNC_CAPTURE_STORE)
      .getAllKeys(
        IDBKeyRange.bound(after ?? prefix, `${prefix}\uffff`, after !== undefined, false),
        64
      );
    for (const key of keys) {
      const record = parseSyncCaptureRecord(
        await tx.objectStore(stores.SYNC_CAPTURE_STORE).get(key)
      );
      if (!record || record.kind !== 'root-state' || key !== record.key)
        throw new Error('Native cache root authority is invalid.');
      states.push(record);
    }
    await tx.done;
    const last = keys[keys.length - 1];
    after = keys.length === 64 && typeof last === 'string' ? last : undefined;
  } while (after !== undefined);
  return states;
}

async function inventory(db: Database, index?: CatalogCopyIndex) {
  return runWithAssetResourceRead(async () => {
    const snapshot = await collectDurableAssetSnapshot(db);
    if (!snapshot.authorityValid) throw new Error('Native cache inventory authority is invalid.');
    const owned = new Set(snapshot.expectedOwners.map((owner) => owner.assetId));
    const records = new Map<string, Candidate>();
    for (const ref of snapshot.refs) {
      if (!owned.has(ref.assetId)) continue;
      let residentBytes: number | null = null;
      try {
        residentBytes = (await readAssetFile(ref, ref.assetId)).size;
      } catch (error) {
        if (
          !(error instanceof MissingAssetObjectError) &&
          !(error instanceof DOMException && error.name === 'NotFoundError')
        )
          throw error;
      }
      const id = assetResidencyCopyId({ kind: 'opfs', ref });
      records.set(id, {
        id,
        size: ref.size,
        residentBytes,
        lastUsedAt: ref.createdAt,
        pinned: false,
        root: null,
      });
    }
    const mediaKeys = await db.getAllKeys(stores.MEDIA_LIBRARY_STORE);
    for (const key of mediaKeys) {
      const media = parseMediaLibraryEntry(await db.get(stores.MEDIA_LIBRARY_STORE, key));
      if (!media) throw new Error('Native cache media authority is invalid.');
      if (media.source.kind !== 'screenshot') continue;
      const id = assetResidencyCopyId({ kind: 'inline-image', mediaId: media.id });
      records.set(id, {
        id,
        size: media.size,
        residentBytes: media.blob?.size ?? null,
        lastUsedAt: media.createdAt,
        pinned: false,
        root: null,
      });
    }
    const profileTx = db.transaction([stores.SYNC_CAPTURE_STORE], 'readonly');
    const profile = await readEnabledCaptureProfile(profileTx);
    await profileTx.done;
    for (const state of await nativeStates(db)) {
      if (state.deleted || state.spaceId !== profile?.spaceId || !(await exists(db, state)))
        continue;
      const acknowledged =
        !!index &&
        state.basis.length > 0 &&
        state.basis.every((id) => {
          const operation = index.operations.get(id);
          return operation?.rootKind === state.rootKind && operation.rootId === state.rootId;
        });
      for (const id of await rootResources(db, state)) {
        const item = records.get(id);
        if (!item) continue;
        item.lastUsedAt = Math.max(item.lastUsedAt, state.createdAt);
        if (acknowledged && !item.root)
          item.root = { rootKind: state.rootKind, rootId: state.rootId };
      }
    }
    let pinnedRoots = 0;
    let after: string | undefined;
    do {
      const tx = db.transaction([stores.ASSET_RESIDENCY_STORE], 'readonly');
      const page = await readAssetResidencyRootsPageInTransaction(tx, after);
      await tx.done;
      for (const root of page.records) {
        if (!(await exists(db, root))) continue;
        if (root.pinned) pinnedRoots++;
        for (const id of await rootResources(db, root)) {
          const item = records.get(id);
          if (!item) continue;
          item.lastUsedAt = Math.max(item.lastUsedAt, root.lastUsedAt);
          item.pinned ||= root.pinned;
        }
      }
      after = page.nextId ?? undefined;
    } while (after !== undefined);
    return { candidates: [...records.values()], pinnedRoots };
  });
}
function summary(
  settings: Awaited<ReturnType<typeof readNativeCacheSettings>>,
  entries: Awaited<ReturnType<typeof inventory>>
): SyncCacheStatus {
  const residentBytes = entries.candidates.reduce(
    (sum, item) => sum + (item.residentBytes ?? 0),
    0
  );
  return {
    budgetBytes: settings.budgetBytes,
    budgetRevision: settings.revision,
    residentBytes,
    missingBytes: entries.candidates.reduce(
      (sum, item) => sum + (item.residentBytes === null ? item.size : 0),
      0
    ),
    pinnedBytes: entries.candidates.reduce(
      (sum, item) => sum + (item.pinned ? (item.residentBytes ?? 0) : 0),
      0
    ),
    pinnedRoots: entries.pinnedRoots,
    overBudgetBytes: Math.max(0, residentBytes - settings.budgetBytes),
  };
}

/** Logical original/project-file bytes, not browser disk usage, thumbnails or transfer staging. */
export async function readNativeCacheStatus(): Promise<SyncCacheStatus> {
  const db = await initDB();
  const settings = await readNativeCacheSettings();
  return summary(settings, await inventory(db));
}

/** A soft budget never overrides pins, native writers or absence of checked remote publication. */
export async function trimNativeCache(
  args: Omit<NativeCacheReleaseInput, 'root' | 'targetIds'>
): Promise<SyncCacheTrimResult> {
  const db = await initDB();
  const settings = await readNativeCacheSettings();
  const observed = await inventory(db, args.index);
  let remaining = summary(settings, observed).residentBytes;
  const result = { released: 0, releasedBytes: 0, unavailable: 0, busy: 0, protected: 0 };
  for (const candidate of observed.candidates.sort(
    (a, b) => a.lastUsedAt - b.lastUsedAt || a.id.localeCompare(b.id)
  )) {
    args.signal.throwIfAborted();
    if (remaining <= settings.budgetBytes) break;
    if (candidate.residentBytes === null) continue;
    if (candidate.pinned || !candidate.root) {
      result.protected++;
      continue;
    }
    const released = await releaseNativeEditingRoot({
      ...args,
      root: candidate.root,
      targetIds: new Set([candidate.id]),
    });
    for (const key of ['released', 'releasedBytes', 'unavailable', 'busy', 'protected'] as const)
      result[key] += released[key];
    remaining = Math.max(0, remaining - released.releasedBytes);
  }
  // Concurrent writers can change totals. Report the actual remaining native inventory after the pass.
  return { ...result, status: summary(await readNativeCacheSettings(), await inventory(db)) };
}
