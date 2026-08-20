import {
  deleteAssetObject,
  listAssetObjectIds,
  listReadyJournals,
  listWritingAssetIds,
  parseBackupAssetOperation,
  parsePhysicalDeleteAssetOperation,
  parseAssetOwner,
  parseAssetRef,
  parseArchiveRestoreSession,
  runWithAssetObjectLockIfAvailable,
  type AssetOperation,
  type AssetOwner,
  type AssetRef,
  type ArchiveRestoreSession,
} from '../assets';
import {
  ASSET_OWNERS_STORE,
  ASSET_OPERATIONS_STORE,
  ASSET_REFS_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  SCENARIO_ASSETS_STORE,
  IMAGE_WORKSPACES_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
  STORE_NAME,
  WEB_SNAPSHOTS_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { runWithDurableAssetLifecycleLock } from '../infrastructure/mutation-barrier';
import { parseProjectAssetEntry, parseProjectExportEntry } from '../projects/read-guards';
import { parseRecordingEntry } from '../recordings/index.guards';
import { parseScenarioAssetEntry } from '../scenario/read-guards';
import { parseImageWorkspaceEntry } from '../image-workspaces/parser';
import { parseScenarioStepEditorDocumentEntry } from '../scenario/editor-documents';
import { parseStoredWebSnapshotRecord } from '../web-snapshots';

interface DurableAssetAuditReport {
  authorityValid: boolean;
  embeddedBinaryMetadata: string[];
  objectsWithoutAuthority: string[];
  orphanedJournals: string[];
  ownersWithoutRefs: AssetOwner[];
  ownerMetadataMismatches: AssetOwner[];
  refsWithoutObjects: AssetRef[];
  refsWithoutOwners: AssetRef[];
  unfinishedRestoreSessions: ArchiveRestoreSession[];
}

export async function auditDurableAssets(): Promise<DurableAssetAuditReport> {
  const [snapshot, objectIds, readyJournals, writingIds] = await Promise.all([
    collectDurableAssetSnapshot(),
    listAssetObjectIds(),
    listReadyJournals(),
    listWritingAssetIds(),
  ]);
  const refsById = new Map(snapshot.refs.map((ref) => [ref.assetId, ref]));
  const objectIdSet = new Set(objectIds);
  const ownedAssetIds = new Set(snapshot.owners.map((owner) => owner.assetId));
  const actualOwnersByKey = new Map(snapshot.owners.map((owner) => [ownerKey(owner), owner]));
  const expectedAssetUse = new Map<string, number>();
  for (const owner of snapshot.expectedOwners) {
    expectedAssetUse.set(owner.assetId, (expectedAssetUse.get(owner.assetId) ?? 0) + 1);
  }
  const ownerMetadataMismatches = new Map<string, AssetOwner>();
  for (const owner of snapshot.owners) {
    if (snapshot.expectedOwnerAssets.get(ownerKey(owner)) !== owner.assetId) {
      ownerMetadataMismatches.set(`${ownerKey(owner)}\u0000${owner.assetId}`, owner);
    }
  }
  for (const expected of snapshot.expectedOwners) {
    const actual = actualOwnersByKey.get(ownerKey(expected));
    if (actual?.assetId !== expected.assetId || (expectedAssetUse.get(expected.assetId) ?? 0) > 1) {
      ownerMetadataMismatches.set(`${ownerKey(expected)}\u0000${expected.assetId}`, expected);
    }
  }
  const protectedIds = new Set([
    ...snapshot.protectedRollbackAssetIds,
    ...writingIds,
    ...readyJournals.flatMap((journal) => journal.assetRefs.map((ref) => ref.assetId)),
  ]);
  return {
    authorityValid: snapshot.authorityValid,
    embeddedBinaryMetadata: snapshot.embeddedBinaryMetadata,
    objectsWithoutAuthority: objectIds.filter(
      (assetId) => snapshot.authorityValid && !refsById.has(assetId) && !protectedIds.has(assetId)
    ),
    ownersWithoutRefs: snapshot.owners.filter((owner) => !refsById.has(owner.assetId)),
    ownerMetadataMismatches: [...ownerMetadataMismatches.values()],
    orphanedJournals: readyJournals
      .filter(
        (journal) =>
          journal.operationId !== undefined && !snapshot.operationIds.has(journal.operationId)
      )
      .map((journal) => journal.journalId),
    refsWithoutObjects: snapshot.refs.filter((ref) => !objectIdSet.has(ref.assetId)),
    refsWithoutOwners: snapshot.refs.filter((ref) => !ownedAssetIds.has(ref.assetId)),
    unfinishedRestoreSessions: snapshot.archiveSessions.filter(
      (session) => session.status === 'pending'
    ),
  };
}

export async function collectOrphanAssetObjects(): Promise<DurableAssetAuditReport> {
  return runWithDurableAssetLifecycleLock(collectOrphanAssetObjectsUnderLock);
}

async function collectOrphanAssetObjectsUnderLock(): Promise<DurableAssetAuditReport> {
  const report = await auditDurableAssets();
  if (!report.authorityValid) return report;
  for (const assetId of report.objectsWithoutAuthority) {
    await runWithAssetObjectLockIfAvailable(assetId, async () => {
      if (await isStillOrphanAssetObject(assetId)) await deleteAssetObject(assetId);
    });
  }
  return report;
}

async function isStillOrphanAssetObject(assetId: string): Promise<boolean> {
  const snapshot = await collectDurableAssetSnapshot();
  if (
    !snapshot.authorityValid ||
    snapshot.refs.some((ref) => ref.assetId === assetId) ||
    snapshot.protectedRollbackAssetIds.has(assetId)
  )
    return false;
  const [readyJournals, writingIds] = await Promise.all([
    listReadyJournals(),
    listWritingAssetIds(),
  ]);
  return (
    !writingIds.includes(assetId) &&
    !readyJournals.some((journal) => journal.assetRefs.some((ref) => ref.assetId === assetId))
  );
}

async function collectDurableAssetSnapshot(): Promise<{
  authorityValid: boolean;
  archiveSessions: ArchiveRestoreSession[];
  embeddedBinaryMetadata: string[];
  expectedOwnerAssets: Map<string, string>;
  expectedOwners: AssetOwner[];
  owners: AssetOwner[];
  operationIds: Set<string>;
  protectedRollbackAssetIds: Set<string>;
  refs: AssetRef[];
}> {
  const [
    rawRefs,
    rawOwners,
    rawOperations,
    rawRecordings,
    rawProjectAssets,
    rawProjectExports,
    rawScenarioAssets,
    rawImageWorkspaces,
    rawScenarioDocuments,
    rawWebSnapshots,
  ] = await runWithIndexedDbMutation(async (db) =>
    Promise.all([
      db.getAll(ASSET_REFS_STORE),
      db.getAll(ASSET_OWNERS_STORE),
      db.getAll(ASSET_OPERATIONS_STORE),
      db.getAll(STORE_NAME),
      db.getAll(PROJECT_ASSETS_STORE),
      db.getAll(PROJECT_EXPORTS_STORE),
      db.getAll(SCENARIO_ASSETS_STORE),
      db.getAll(IMAGE_WORKSPACES_STORE),
      db.getAll(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE),
      db.getAll(WEB_SNAPSHOTS_STORE),
    ])
  );
  const refsResult = parseRows(rawRefs, parseAssetRef);
  const ownersResult = parseRows(rawOwners, parseAssetOwner);
  const operationsResult = parseAssetOperations(rawOperations);
  const recordingsResult = parseRows(rawRecordings, parseRecordingEntry);
  const projectAssetsResult = parseRows(rawProjectAssets, parseProjectAssetEntry);
  const projectExportsResult = parseRows(rawProjectExports, parseProjectExportEntry);
  const scenarioAssetsResult = parseRows(rawScenarioAssets, parseScenarioAssetEntry);
  const imageWorkspacesResult = parseRows(rawImageWorkspaces, parseImageWorkspaceEntry);
  const scenarioDocumentsResult = parseRows(
    rawScenarioDocuments,
    parseScenarioStepEditorDocumentEntry
  );
  const webSnapshotsResult = parseRows(rawWebSnapshots, parseStoredWebSnapshotRecord);
  const refs = refsResult.entries;
  const owners = ownersResult.entries;
  const expectedOwnerAssets = new Map<string, string>();
  const expectedOwners: AssetOwner[] = [];
  for (const entry of recordingsResult.entries) {
    expectedOwners.push(createExpectedOwner('recording', entry.id, entry.assetId));
  }
  for (const entry of projectAssetsResult.entries) {
    expectedOwners.push(createExpectedOwner('project-asset', entry.id, entry.assetId));
  }
  for (const entry of projectExportsResult.entries) {
    expectedOwners.push(createExpectedOwner('project-export', entry.id, entry.assetId));
  }
  for (const entry of scenarioAssetsResult.entries) {
    expectedOwners.push(createExpectedOwner('scenario-asset', entry.id, entry.assetId));
  }
  for (const entry of imageWorkspacesResult.entries) {
    for (const asset of entry.document.assets) {
      expectedOwners.push({
        assetId: asset.assetId,
        ownerId: entry.aggregateId,
        ownerKind: 'image-workspace',
        role: asset.role,
      });
    }
  }
  for (const entry of scenarioDocumentsResult.entries) {
    for (const asset of entry.document.assets) {
      expectedOwners.push({
        assetId: asset.assetId,
        ownerId: entry.stepId,
        ownerKind: 'scenario-editor-document',
        role: asset.role,
      });
    }
  }
  for (const entry of webSnapshotsResult.entries) {
    expectedOwners.push({
      assetId: entry.packageAssetId,
      ownerId: entry.id,
      ownerKind: 'web-snapshot',
      role: 'package',
    });
    expectedOwners.push({
      assetId: entry.screenshotAssetId,
      ownerId: entry.id,
      ownerKind: 'web-snapshot',
      role: 'screenshot',
    });
  }
  for (const owner of expectedOwners) {
    expectedOwnerAssets.set(ownerKey(owner), owner.assetId);
  }
  return {
    authorityValid: [
      refsResult,
      ownersResult,
      operationsResult,
      recordingsResult,
      projectAssetsResult,
      projectExportsResult,
      scenarioAssetsResult,
      imageWorkspacesResult,
      scenarioDocumentsResult,
      webSnapshotsResult,
    ].every((result) => result.valid),
    archiveSessions: operationsResult.archiveSessions,
    embeddedBinaryMetadata: [
      ...findEmbeddedBinaryRows(rawImageWorkspaces, 'image-workspace'),
      ...findEmbeddedBinaryRows(rawScenarioDocuments, 'scenario-editor-document'),
    ],
    expectedOwnerAssets,
    expectedOwners,
    owners,
    operationIds: new Set([
      ...operationsResult.archiveSessions.map((operation) => operation.operationId),
      ...operationsResult.backupOperations.map((operation) => operation.operationId),
    ]),
    protectedRollbackAssetIds: new Set(
      operationsResult.backupOperations
        .filter((operation) => operation.status !== 'committed')
        .flatMap((operation) => operation.obsoleteAssetIds)
    ),
    refs,
  };
}

function findEmbeddedBinaryRows(raw: unknown, owner: string): string[] {
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
  raw.forEach((row, index) => visit(row, `${owner}[${index}]`, 0));
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
