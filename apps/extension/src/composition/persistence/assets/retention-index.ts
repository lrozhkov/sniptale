import {
  ROW_REFERENCE_INDEX,
  UNKNOWN_ASSET_REFERENCES,
  rowReferenceKey,
} from '../infrastructure/indexed-db/row-index-contract';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { projectRetentionRow } from './retention-index-projection';
import {
  parseAssetOwner,
  parseAssetRef,
  parseArchiveRestoreSession,
  parseBackupAssetOperation,
} from './guards';
import type { AssetOwner, AssetRetentionSnapshot } from './contracts';

const CLAIM_STORES = [
  'editor_vector_library',
  'video_projects',
  'recordings',
  'project_assets',
  'project_exports',
  'scenario_assets',
  'scenario_exports',
  'image_workspaces',
  'scenario_step_editor_documents',
  'web_snapshots',
  'media_library',
  'asset_operations',
  'sync_capture',
] as const;
const HISTORY_STORES = ['recording_cursor_trajectories', 'recording_events'] as const;
const SNAPSHOT_STORES = ['asset_refs', 'asset_owners', ...CLAIM_STORES, ...HISTORY_STORES];
const ownerKey = (owner: AssetOwner) =>
  `${owner.ownerKind}\u0000${owner.ownerId}\u0000${owner.role}`;

interface AssetSnapshotDatabase {
  transaction(
    stores: string[],
    mode: 'readonly'
  ): {
    readonly done: Promise<void>;
    abort(): void;
    objectStore(name: string): {
      get(key: IDBValidKey): Promise<unknown>;
      index(name: string): {
        getAll(key: IDBValidKey): Promise<unknown[]>;
        getKey(key: IDBValidKey): Promise<IDBValidKey | undefined>;
      };
    };
  };
}

type SnapshotTransaction = Pick<ReturnType<AssetSnapshotDatabase['transaction']>, 'objectStore'>;
interface SourceBatch {
  name: string;
  rows: unknown[];
}

function emptySnapshot(): AssetRetentionSnapshot {
  return {
    authorityValid: true,
    archiveSessions: [],
    embeddedBinaryMetadata: [],
    expectedOwnerAssets: new Map(),
    expectedOwners: [],
    owners: [],
    refs: [],
    operationIds: new Set(),
    protectedRollbackAssetIds: new Set(),
    protectedSyncCaptureAssetIds: new Set(),
    publishedProjectAssetIds: new Set(),
  };
}

function admitActualOwner(
  snapshot: AssetRetentionSnapshot,
  owners: Map<string, AssetOwner>,
  row: unknown,
  assetId?: string
): void {
  const owner = parseAssetOwner(row);
  if (!owner || (assetId !== undefined && owner.assetId !== assetId))
    snapshot.authorityValid = false;
  else owners.set(ownerKey(owner), owner);
}

function admitSourceBatch(
  snapshot: AssetRetentionSnapshot,
  expected: Map<string, AssetOwner>,
  batch: SourceBatch
): void {
  for (const row of batch.rows) {
    const projection = projectRetentionRow(batch.name, row);
    snapshot.authorityValid &&= projection.valid;
    for (const owner of projection.owners) expected.set(ownerKey(owner), owner);
    for (const id of projection.rollbackAssetIds) snapshot.protectedRollbackAssetIds.add(id);
    for (const id of projection.syncAssetIds) snapshot.protectedSyncCaptureAssetIds.add(id);
    for (const id of projection.publishedProjectAssetIds) snapshot.publishedProjectAssetIds.add(id);
    if (batch.name !== 'asset_operations') continue;
    const archive = parseArchiveRestoreSession(row);
    const backup = parseBackupAssetOperation(row);
    if (archive) {
      snapshot.archiveSessions.push(archive);
      snapshot.operationIds.add(archive.operationId);
    }
    if (backup) snapshot.operationIds.add(backup.operationId);
  }
}

async function readAssetEvidence(tx: SnapshotTransaction, id: string) {
  const [ref, owners, batches] = await Promise.all([
    tx.objectStore('asset_refs').get(id),
    tx.objectStore('asset_owners').index('assetId').getAll(id),
    Promise.all([
      ...CLAIM_STORES.map(async (name) => ({
        name,
        rows: await tx
          .objectStore(name)
          .index(ROW_REFERENCE_INDEX)
          .getAll(rowReferenceKey('asset', id)),
      })),
      ...HISTORY_STORES.map(async (name) => ({
        name,
        rows: await tx.objectStore(name).index('snapshotAssetId').getAll(id),
      })),
    ]),
  ]);
  return { ref, owners, batches };
}

function admitRef(snapshot: AssetRetentionSnapshot, row: unknown, id: string): void {
  if (row === undefined) return;
  const ref = parseAssetRef(row);
  if (!ref || ref.assetId !== id) snapshot.authorityValid = false;
  else snapshot.refs.push(ref);
}

async function admitPublishedSources(
  tx: SnapshotTransaction,
  snapshot: AssetRetentionSnapshot,
  expected: AssetOwner
): Promise<void> {
  if (expected.ownerKind !== 'project-asset') return;
  const rows = await tx
    .objectStore('media_library')
    .index(ROW_REFERENCE_INDEX)
    .getAll(rowReferenceKey('project-asset', expected.ownerId));
  for (const row of rows) {
    const entry = parseMediaLibraryEntry(row);
    if (!entry) snapshot.authorityValid = false;
    else if (entry.source.kind === 'project-asset')
      snapshot.publishedProjectAssetIds.add(entry.source.projectAssetId);
  }
}

async function resolveProjectedBindings(
  tx: SnapshotTransaction,
  snapshot: AssetRetentionSnapshot,
  expected: Map<string, AssetOwner>,
  actual: Map<string, AssetOwner>
): Promise<void> {
  for (const owner of expected.values()) {
    const row: unknown = await tx
      .objectStore('asset_owners')
      .get([owner.ownerKind, owner.ownerId, owner.role]);
    if (row !== undefined) admitActualOwner(snapshot, actual, row);
    await admitPublishedSources(tx, snapshot, owner);
  }
}

/** Inspect the caller's native snapshot, including uncommitted changes to its metadata. */
export async function collectTargetAssetSnapshotInTransaction(
  tx: SnapshotTransaction,
  assetIds: Iterable<string>,
  signal?: AbortSignal
): Promise<AssetRetentionSnapshot> {
  const ids = [...new Set(assetIds)];
  const snapshot = emptySnapshot();
  if (!ids.length) return snapshot;
  const unknown = await Promise.all(
    ['asset_refs', 'asset_owners', ...CLAIM_STORES].map((name) =>
      tx.objectStore(name).index(ROW_REFERENCE_INDEX).getKey(UNKNOWN_ASSET_REFERENCES)
    )
  );
  if (unknown.some((key) => key !== undefined)) snapshot.authorityValid = false;
  const actual = new Map<string, AssetOwner>();
  const expected = new Map<string, AssetOwner>();
  for (const id of ids) {
    signal?.throwIfAborted();
    const evidence = await readAssetEvidence(tx, id);
    admitRef(snapshot, evidence.ref, id);
    for (const row of evidence.owners) admitActualOwner(snapshot, actual, row, id);
    for (const batch of evidence.batches) admitSourceBatch(snapshot, expected, batch);
  }
  await resolveProjectedBindings(tx, snapshot, expected, actual);
  snapshot.expectedOwners = [...expected.values()];
  snapshot.expectedOwnerAssets = new Map(
    snapshot.expectedOwners.map((owner) => [ownerKey(owner), owner.assetId])
  );
  snapshot.owners = [...actual.values()];
  return snapshot;
}

/** Prepare only selected objects' durable evidence in one native snapshot. Missing coverage retains bytes. */
export async function collectTargetAssetSnapshot(
  db: AssetSnapshotDatabase,
  assetIds: Iterable<string>,
  signal?: AbortSignal
): Promise<AssetRetentionSnapshot> {
  const ids = [...new Set(assetIds)];
  if (!ids.length) return emptySnapshot();
  signal?.throwIfAborted();
  const tx = db.transaction(SNAPSHOT_STORES, 'readonly');
  void tx.done.catch(() => undefined);
  try {
    const snapshot = await collectTargetAssetSnapshotInTransaction(tx, ids, signal);
    await tx.done;
    signal?.throwIfAborted();
    return snapshot;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* The native snapshot may already be closed. */
    }
    await tx.done.catch(() => undefined);
    throw error;
  }
}
