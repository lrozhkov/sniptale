import { projectRetentionRow } from './retention-index-projection';
import { collectSyncCaptureClaims } from '../sync-capture/claims';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  parseAssetOwner,
  parseAssetRef,
  parseBackupAssetOperation,
  parsePhysicalDeleteAssetOperation,
  parseArchiveRestoreSession,
} from './guards';
import type { AssetOwner, AssetRef, ArchiveRestoreSession } from './contracts';
import { collectBackupRollbackAssetIds } from './retention-claims';
import {
  SYNC_CAPTURE_STORE,
  ASSET_OWNERS_STORE,
  ASSET_OPERATIONS_STORE,
  ASSET_REFS_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  SCENARIO_ASSETS_STORE,
  SCENARIO_EXPORTS_STORE,
  IMAGE_WORKSPACES_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
  STORE_NAME,
  WEB_SNAPSHOTS_STORE,
  MEDIA_LIBRARY_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';

const logger = createLogger({ namespace: 'AssetRetention' });

export async function collectDurableAssetSnapshot(
  db?: Awaited<ReturnType<typeof import('../infrastructure/indexed-db/core').initDB>>,
  signal?: AbortSignal
): Promise<{
  authorityValid: boolean;
  archiveSessions: ArchiveRestoreSession[];
  embeddedBinaryMetadata: string[];
  expectedOwnerAssets: Map<string, string>;
  expectedOwners: AssetOwner[];
  owners: AssetOwner[];
  operationIds: Set<string>;
  protectedRollbackAssetIds: Set<string>;
  protectedSyncCaptureAssetIds: Set<string>;
  publishedProjectAssetIds: Set<string>;
  refs: AssetRef[];
}> {
  if (!db)
    return runWithIndexedDbMutation((connection) =>
      collectDurableAssetSnapshot(connection, signal)
    );
  signal?.throwIfAborted();
  const refsResult = await parseRows(db, ASSET_REFS_STORE, parseAssetRef, signal);
  const ownersResult = await parseRows(db, ASSET_OWNERS_STORE, parseAssetOwner, signal);
  const operationsResult = await readAssetOperationClaims(db, signal);
  for (const [store, valid] of [
    [ASSET_REFS_STORE, refsResult.valid],
    [ASSET_OWNERS_STORE, ownersResult.valid],
    [ASSET_OPERATIONS_STORE, operationsResult.valid],
  ] as const) {
    if (!valid) logger.debug(`Retention validation failed: ${store}`);
  }
  let authorityValid = refsResult.valid && ownersResult.valid && operationsResult.valid;
  const expectedOwners: AssetOwner[] = [];
  const embeddedBinaryMetadata: string[] = [];
  const publishedProjectAssetIds = new Set<string>();
  for (const store of [
    STORE_NAME,
    PROJECT_ASSETS_STORE,
    PROJECT_EXPORTS_STORE,
    SCENARIO_ASSETS_STORE,
    SCENARIO_EXPORTS_STORE,
    IMAGE_WORKSPACES_STORE,
    SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
    WEB_SNAPSHOTS_STORE,
    MEDIA_LIBRARY_STORE,
  ]) {
    const embeddedOwner =
      store === IMAGE_WORKSPACES_STORE
        ? 'image-workspace'
        : store === SCENARIO_STEP_EDITOR_DOCUMENTS_STORE
          ? 'scenario-editor-document'
          : undefined;
    const valid = await visitDurableRows(
      db,
      store,
      (raw, index) => {
        if (embeddedOwner)
          embeddedBinaryMetadata.push(...findEmbeddedBinaryRows([raw], embeddedOwner, index));
        const projection = projectRetentionRow(store, raw);
        expectedOwners.push(...projection.owners);
        for (const id of projection.publishedProjectAssetIds) publishedProjectAssetIds.add(id);
        return projection.valid;
      },
      signal
    );
    if (!valid) logger.debug(`Retention validation failed: ${store}`);
    authorityValid &&= valid;
  }
  const captureClaims = await readSyncCaptureClaims(db, signal);
  if (!captureClaims.valid) logger.debug(`Retention validation failed: ${SYNC_CAPTURE_STORE}`);
  authorityValid = authorityValid && captureClaims.valid;
  return {
    authorityValid,
    protectedSyncCaptureAssetIds: captureClaims.assetIds,
    archiveSessions: operationsResult.archiveSessions,
    embeddedBinaryMetadata,
    expectedOwnerAssets: new Map(expectedOwners.map((owner) => [ownerKey(owner), owner.assetId])),
    expectedOwners,
    owners: ownersResult.entries,
    operationIds: operationsResult.operationIds,
    protectedRollbackAssetIds: operationsResult.protectedRollbackAssetIds,
    publishedProjectAssetIds,
    refs: refsResult.entries,
  };
}

async function readSyncCaptureClaims(
  db: Awaited<ReturnType<typeof import('../infrastructure/indexed-db/core').initDB>>,
  signal?: AbortSignal
): Promise<ReturnType<typeof collectSyncCaptureClaims>> {
  const assetIds = new Set<string>();
  const valid = await visitDurableRows(
    db,
    SYNC_CAPTURE_STORE,
    (raw) => {
      const claims = collectSyncCaptureClaims([raw]);
      for (const assetId of claims.assetIds) assetIds.add(assetId);
      return claims.valid;
    },
    signal
  );
  return { valid, assetIds };
}

/** Keep one store snapshot while releasing raw payloads after each bounded request. */
async function visitDurableRows(
  db: Awaited<ReturnType<typeof import('../infrastructure/indexed-db/core').initDB>>,
  store: string,
  visit: (raw: unknown, index: number) => boolean,
  signal?: AbortSignal
): Promise<boolean> {
  signal?.throwIfAborted();
  const tx = db.transaction([store], 'readonly');
  const completed = tx.done;
  void completed.catch(() => undefined);
  try {
    const source = tx.objectStore(store);
    let range: IDBKeyRange | undefined;
    let offset = 0;
    let valid = true;
    while (true) {
      // Native request tasks yield without timers that can commit or stall this transaction.
      const [keys, rows]: [IDBValidKey[], unknown[]] = await Promise.all([
        source.getAllKeys(range, 64),
        source.getAll(range, 64),
      ]);
      signal?.throwIfAborted();
      for (const row of rows) {
        const accepted = visit(row, offset);
        offset += 1;
        valid = valid && accepted;
      }
      if (keys.length < 64) break;
      const lastKey = keys.at(-1);
      if (lastKey === undefined) break;
      range = IDBKeyRange.lowerBound(lastKey, true);
    }
    await completed;
    signal?.throwIfAborted();
    return valid;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      // A completed or natively aborted transaction needs no second abort.
    }
    await completed.catch(() => undefined);
    throw error;
  }
}

function findEmbeddedBinaryRows(raw: unknown, owner: string, offset = 0): string[] {
  if (!Array.isArray(raw)) return [];
  const findings: string[] = [];
  const visit = (value: unknown, path: string, depth: number): void => {
    if (depth > 64) return;
    if (
      typeof value === 'string' &&
      (/^data:[^,]*;base64,/i.test(value) || value.startsWith('blob:'))
    ) {
      findings.push(path);
      return;
    }
    if (value instanceof Blob) {
      findings.push(path);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`, depth + 1));
      return;
    }
    if (typeof value === 'object' && value !== null) {
      for (const [key, child] of Object.entries(value)) {
        visit(child, `${path}.${key}`, depth + 1);
      }
    }
  };
  raw.forEach((row, index) => visit(row, `${owner}[${offset + index}]`, 0));
  return findings;
}

async function readAssetOperationClaims(
  db: Awaited<ReturnType<typeof import('../infrastructure/indexed-db/core').initDB>>,
  signal?: AbortSignal
): Promise<{
  operationIds: Set<string>;
  protectedRollbackAssetIds: Set<string>;
  archiveSessions: ArchiveRestoreSession[];
  valid: boolean;
}> {
  const archiveSessions: ArchiveRestoreSession[] = [];
  const backupOperationIds = new Set<string>();
  const protectedRollbackAssetIds = new Set<string>();
  const valid = await visitDurableRows(
    db,
    ASSET_OPERATIONS_STORE,
    (raw) => {
      const archive = parseArchiveRestoreSession(raw);
      const backup = parseBackupAssetOperation(raw);
      const physicalDelete = parsePhysicalDeleteAssetOperation(raw);
      if (archive) archiveSessions.push(archive);
      if (backup) {
        backupOperationIds.add(backup.operationId);
        for (const assetId of collectBackupRollbackAssetIds(backup))
          protectedRollbackAssetIds.add(assetId);
      }
      return archive !== null || backup !== null || physicalDelete !== null;
    },
    signal
  );
  return {
    archiveSessions,
    operationIds: new Set([
      ...archiveSessions.map((operation) => operation.operationId),
      ...backupOperationIds,
    ]),
    protectedRollbackAssetIds,
    valid,
  };
}

async function parseRows<T>(
  db: Awaited<ReturnType<typeof import('../infrastructure/indexed-db/core').initDB>>,
  store: string,
  parse: (value: unknown) => T | null,
  signal?: AbortSignal
): Promise<{ entries: T[]; valid: boolean }> {
  const entries: T[] = [];
  const valid = await visitDurableRows(
    db,
    store,
    (raw) => {
      const entry = parse(raw);
      if (entry === null) return false;
      entries.push(entry);
      return true;
    },
    signal
  );
  return { entries, valid };
}

function ownerKey(owner: AssetOwner): string {
  return ownerKeyParts(owner.ownerKind, owner.ownerId, owner.role);
}

function ownerKeyParts(ownerKind: string, ownerId: string, role: string): string {
  return `${ownerKind}\u0000${ownerId}\u0000${role}`;
}
