import { collectSyncCaptureClaims } from '../sync-capture/claims';
import { createLogger } from '@sniptale/platform/observability/logger';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import type { MediaLibraryEntry } from '../media-library/contracts';
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
import { parseProjectAssetEntry, parseProjectExportEntry } from '../projects/read-guards';
import { parseRecordingEntry } from '../recordings/index.guards';
import { parseScenarioAssetEntry, parseScenarioExportEntry } from '../scenario/read-guards';
import { parseImageWorkspaceEntry } from '../image-workspaces/parser';
import { parseScenarioStepEditorDocumentEntry } from '../scenario/editor-documents/index.guards';
import { parseStoredWebSnapshotRecord } from '../web-snapshots/guards';

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
  const owned = async <T>(
    store: string,
    parse: (raw: unknown) => T | null,
    project: (entry: T) => AssetOwner[],
    embeddedOwner?: string
  ) => {
    const valid = await visitDurableRows(
      db,
      store,
      (raw, index) => {
        if (embeddedOwner)
          embeddedBinaryMetadata.push(...findEmbeddedBinaryRows([raw], embeddedOwner, index));
        const entry = parse(raw);
        if (!entry) return false;
        expectedOwners.push(...project(entry));
        return true;
      },
      signal
    );
    if (!valid) logger.debug(`Retention validation failed: ${store}`);
    authorityValid = authorityValid && valid;
  };
  await owned(STORE_NAME, parseRecordingEntry, (entry) => [
    createExpectedOwner('recording', entry.id, entry.assetId),
  ]);
  await owned(PROJECT_ASSETS_STORE, parseProjectAssetEntry, (entry) => [
    createExpectedOwner('project-asset', entry.id, entry.assetId),
  ]);
  await owned(PROJECT_EXPORTS_STORE, parseProjectExportEntry, (entry) => [
    createExpectedOwner('project-export', entry.id, entry.assetId),
  ]);
  await owned(SCENARIO_ASSETS_STORE, parseScenarioAssetEntry, (entry) => [
    createExpectedOwner('scenario-asset', entry.id, entry.assetId),
  ]);
  await owned(SCENARIO_EXPORTS_STORE, parseScenarioExportEntry, (entry) =>
    entry.html ? [createExpectedOwner('scenario-export', entry.id, entry.html.assetId)] : []
  );
  await owned(
    IMAGE_WORKSPACES_STORE,
    parseImageWorkspaceEntry,
    (entry) =>
      entry.document.assets.map((asset) => ({
        assetId: asset.assetId,
        ownerId: entry.aggregateId,
        ownerKind: 'image-workspace',
        role: asset.role,
      })),
    'image-workspace'
  );
  await owned(
    SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
    parseScenarioStepEditorDocumentEntry,
    (entry) =>
      entry.document.assets.map((asset) => ({
        assetId: asset.assetId,
        ownerId: entry.stepId,
        ownerKind: 'scenario-editor-document',
        role: asset.role,
      })),
    'scenario-editor-document'
  );
  await owned(WEB_SNAPSHOTS_STORE, parseStoredWebSnapshotRecord, (entry) => [
    {
      assetId: entry.packageAssetId,
      ownerId: entry.id,
      ownerKind: 'web-snapshot',
      role: 'package',
    },
    {
      assetId: entry.screenshotAssetId,
      ownerId: entry.id,
      ownerKind: 'web-snapshot',
      role: 'screenshot',
    },
  ]);
  await owned(MEDIA_LIBRARY_STORE, parseMediaLibraryEntry, (entry) => {
    if (entry.source.kind === 'project-asset')
      publishedProjectAssetIds.add(entry.source.projectAssetId);
    return projectMediaOwners(entry);
  });
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

function projectMediaOwners(entry: MediaLibraryEntry): AssetOwner[] {
  return entry.source.kind === 'stored-asset'
    ? [
        {
          assetId: entry.source.assetId,
          ownerId: entry.id,
          ownerKind: 'media-library',
          role: 'source',
        },
      ]
    : [];
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

function createExpectedOwner(ownerKind: string, ownerId: string, assetId: string): AssetOwner {
  return { assetId, ownerId, ownerKind, role: 'body' };
}
