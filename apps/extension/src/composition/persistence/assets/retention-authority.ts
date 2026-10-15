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
import type { AssetOperation, AssetOwner, AssetRef, ArchiveRestoreSession } from './contracts';
import { collectBackupRollbackAssetIds } from './retention-claims';
import {
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
  publishedProjectAssetIds: Set<string>;
  refs: AssetRef[];
}> {
  if (!db)
    return runWithIndexedDbMutation((connection) =>
      collectDurableAssetSnapshot(connection, signal)
    );
  signal?.throwIfAborted();
  const refsResult = parseRows(await db.getAll(ASSET_REFS_STORE), parseAssetRef);
  const ownersResult = parseRows(await db.getAll(ASSET_OWNERS_STORE), parseAssetOwner);
  const operationsResult = parseAssetOperations(await db.getAll(ASSET_OPERATIONS_STORE));
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
  return {
    authorityValid,
    archiveSessions: operationsResult.archiveSessions,
    embeddedBinaryMetadata,
    expectedOwnerAssets: new Map(expectedOwners.map((owner) => [ownerKey(owner), owner.assetId])),
    expectedOwners,
    owners: ownersResult.entries,
    operationIds: new Set([
      ...operationsResult.archiveSessions.map((operation) => operation.operationId),
      ...operationsResult.backupOperations.map((operation) => operation.operationId),
    ]),
    protectedRollbackAssetIds: new Set(
      operationsResult.backupOperations.flatMap(collectBackupRollbackAssetIds)
    ),
    publishedProjectAssetIds,
    refs: refsResult.entries,
  };
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

/** Release parsed canvases/manifests immediately; yield between bounded groups of rows. */
async function visitDurableRows(
  db: Awaited<ReturnType<typeof import('../infrastructure/indexed-db/core').initDB>>,
  store: string,
  visit: (raw: unknown, index: number) => boolean,
  signal?: AbortSignal
): Promise<boolean> {
  signal?.throwIfAborted();
  const rows: unknown = await db.getAll(store);
  if (!Array.isArray(rows)) return false;
  let valid = true;
  for (let index = 0; index < rows.length; index++) {
    if (index % 8 === 0) {
      // Supported Chrome provides scheduler.yield; background timers can stall the lifecycle hold.
      if (typeof scheduler !== 'undefined') await scheduler.yield();
      else await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    signal?.throwIfAborted();
    const accepted = visit(rows[index], index);
    valid = valid && accepted;
  }
  return valid;
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

function parseAssetOperations(raw: unknown): {
  backupOperations: AssetOperation[];
  archiveSessions: ArchiveRestoreSession[];
  valid: boolean;
} {
  if (!Array.isArray(raw)) return { archiveSessions: [], backupOperations: [], valid: false };
  const parsed = raw.map((value) => ({
    archive: parseArchiveRestoreSession(value),
    backup: parseBackupAssetOperation(value),
    physicalDelete: parsePhysicalDeleteAssetOperation(value),
  }));
  return {
    archiveSessions: parsed.flatMap(({ archive }) => (archive ? [archive] : [])),
    backupOperations: parsed.flatMap(({ backup }) => (backup ? [backup] : [])),
    valid: parsed.every(
      ({ archive, backup, physicalDelete }) =>
        archive !== null || backup !== null || physicalDelete !== null
    ),
  };
}

function parseRows<T>(
  raw: unknown,
  parse: (value: unknown) => T | null
): { entries: T[]; valid: boolean } {
  if (!Array.isArray(raw)) return { entries: [], valid: false };
  const parsed = raw.map(parse);
  return { entries: parsed.filter(isPresent), valid: parsed.every(isPresent) };
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

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}
