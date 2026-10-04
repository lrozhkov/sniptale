import { parseMediaLibraryEntry } from '../media-library/read-guards';
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

export async function collectDurableAssetSnapshot(
  db?: Awaited<ReturnType<typeof import('../infrastructure/indexed-db/core').initDB>>
): Promise<{
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
    rawScenarioExports,
    rawImageWorkspaces,
    rawScenarioDocuments,
    rawWebSnapshots,
    rawMedia,
  ] = await (db ? readDurableRows(db) : runWithIndexedDbMutation(readDurableRows));
  const refsResult = parseRows(rawRefs, parseAssetRef);
  const ownersResult = parseRows(rawOwners, parseAssetOwner);
  const operationsResult = parseAssetOperations(rawOperations);
  const recordingsResult = parseRows(rawRecordings, parseRecordingEntry);
  const projectAssetsResult = parseRows(rawProjectAssets, parseProjectAssetEntry);
  const projectExportsResult = parseRows(rawProjectExports, parseProjectExportEntry);
  const scenarioAssetsResult = parseRows(rawScenarioAssets, parseScenarioAssetEntry);
  const scenarioExportsResult = parseRows(rawScenarioExports, parseScenarioExportEntry);
  const imageWorkspacesResult = parseRows(rawImageWorkspaces, parseImageWorkspaceEntry);
  const scenarioDocumentsResult = parseRows(
    rawScenarioDocuments,
    parseScenarioStepEditorDocumentEntry
  );
  const webSnapshotsResult = parseRows(rawWebSnapshots, parseStoredWebSnapshotRecord);
  const mediaResult = parseRows(rawMedia, parseMediaLibraryEntry);
  const refs = refsResult.entries;
  const owners = ownersResult.entries;
  const expectedOwners = projectExpectedOwners({
    recordings: recordingsResult.entries,
    projectAssets: projectAssetsResult.entries,
    projectExports: projectExportsResult.entries,
    scenarioAssets: scenarioAssetsResult.entries,
    scenarioExports: scenarioExportsResult.entries,
    imageWorkspaces: imageWorkspacesResult.entries,
    scenarioDocuments: scenarioDocumentsResult.entries,
    webSnapshots: webSnapshotsResult.entries,
    media: mediaResult.entries,
  });
  const expectedOwnerAssets = new Map(
    expectedOwners.map((owner) => [ownerKey(owner), owner.assetId])
  );
  return {
    authorityValid: [
      refsResult,
      ownersResult,
      operationsResult,
      recordingsResult,
      projectAssetsResult,
      projectExportsResult,
      scenarioAssetsResult,
      scenarioExportsResult,
      imageWorkspacesResult,
      scenarioDocumentsResult,
      webSnapshotsResult,
      mediaResult,
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
      operationsResult.backupOperations.flatMap(collectBackupRollbackAssetIds)
    ),
    refs,
  };
}

/** Pure metadata projection owns the domain graph independently of snapshot IO and validity. */
type OwnershipMetadata = {
  recordings: NonNullable<ReturnType<typeof parseRecordingEntry>>[];
  projectAssets: NonNullable<ReturnType<typeof parseProjectAssetEntry>>[];
  projectExports: NonNullable<ReturnType<typeof parseProjectExportEntry>>[];
  scenarioAssets: NonNullable<ReturnType<typeof parseScenarioAssetEntry>>[];
  scenarioExports: NonNullable<ReturnType<typeof parseScenarioExportEntry>>[];
  imageWorkspaces: NonNullable<ReturnType<typeof parseImageWorkspaceEntry>>[];
  scenarioDocuments: NonNullable<ReturnType<typeof parseScenarioStepEditorDocumentEntry>>[];
  webSnapshots: NonNullable<ReturnType<typeof parseStoredWebSnapshotRecord>>[];
  media: NonNullable<ReturnType<typeof parseMediaLibraryEntry>>[];
};

function projectExpectedOwners(metadata: OwnershipMetadata) {
  const expectedOwners: AssetOwner[] = [];
  for (const entry of metadata.media)
    if (entry.source.kind === 'stored-asset')
      expectedOwners.push({
        assetId: entry.source.assetId,
        ownerKind: 'media-library',
        ownerId: entry.id,
        role: 'source',
      });
  for (const entry of metadata.recordings) {
    expectedOwners.push(createExpectedOwner('recording', entry.id, entry.assetId));
  }
  for (const entry of metadata.projectAssets) {
    expectedOwners.push(createExpectedOwner('project-asset', entry.id, entry.assetId));
  }
  for (const entry of metadata.projectExports) {
    expectedOwners.push(createExpectedOwner('project-export', entry.id, entry.assetId));
  }
  for (const entry of metadata.scenarioAssets) {
    expectedOwners.push(createExpectedOwner('scenario-asset', entry.id, entry.assetId));
  }
  for (const entry of metadata.scenarioExports) {
    if (entry.html)
      expectedOwners.push(createExpectedOwner('scenario-export', entry.id, entry.html.assetId));
  }
  expectedOwners.push(...projectDocumentOwners(metadata));
  for (const entry of metadata.webSnapshots) {
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
  return expectedOwners;
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

function readDurableRows(
  db: Awaited<ReturnType<typeof import('../infrastructure/indexed-db/core').initDB>>
) {
  return Promise.all([
    db.getAll(ASSET_REFS_STORE),
    db.getAll(ASSET_OWNERS_STORE),
    db.getAll(ASSET_OPERATIONS_STORE),
    db.getAll(STORE_NAME),
    db.getAll(PROJECT_ASSETS_STORE),
    db.getAll(PROJECT_EXPORTS_STORE),
    db.getAll(SCENARIO_ASSETS_STORE),
    db.getAll(SCENARIO_EXPORTS_STORE),
    db.getAll(IMAGE_WORKSPACES_STORE),
    db.getAll(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE),
    db.getAll(WEB_SNAPSHOTS_STORE),
    db.getAll(MEDIA_LIBRARY_STORE),
  ]);
}

/** Editable document bindings have roles independent of source body ownership. */
function projectDocumentOwners(metadata: OwnershipMetadata): AssetOwner[] {
  const expectedOwners: AssetOwner[] = [];
  for (const entry of metadata.imageWorkspaces) {
    for (const asset of entry.document.assets) {
      expectedOwners.push({
        assetId: asset.assetId,
        ownerId: entry.aggregateId,
        ownerKind: 'image-workspace',
        role: asset.role,
      });
    }
  }
  for (const entry of metadata.scenarioDocuments) {
    for (const asset of entry.document.assets) {
      expectedOwners.push({
        assetId: asset.assetId,
        ownerId: entry.stepId,
        ownerKind: 'scenario-editor-document',
        role: asset.role,
      });
    }
  }
  return expectedOwners;
}
