import {
  AGGREGATE_PRESENTATIONS_STORE,
  ASSET_OPERATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  DIAGNOSTICS_EVENTS_STORE,
  DIAGNOSTICS_META_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  RECORDING_TELEMETRY_STORE,
  STATE_MANAGER_STORE,
  STORE_NAME,
  THUMBNAILS_STORE,
  VIDEO_PROJECTS_STORE,
} from '../core.stores.ts';
import type { UpgradeDatabase, UpgradeObjectStore, UpgradeTransaction } from './types';

const COMPLETION_OUTBOX_KEY: [string, string] = ['video-recording-completion-outbox', 'pending'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readId(value: unknown): string | null {
  return isRecord(value) ? readString(value['id']) : null;
}

function readProjectReferences(value: unknown): {
  projectAssetIds: Set<string>;
  recordingIds: Set<string>;
} {
  const projectAssetIds = new Set<string>();
  const recordingIds = new Set<string>();
  if (!isRecord(value) || !isRecord(value['project'])) return { projectAssetIds, recordingIds };
  const project = value['project'];
  const baseRecordingId = readString(project['baseRecordingId']);
  if (baseRecordingId) recordingIds.add(baseRecordingId);
  const source = project['source'];
  if (isRecord(source) && source['kind'] === 'recording') {
    const id = readString(source['recordingId']);
    if (id) recordingIds.add(id);
  }
  if (!Array.isArray(project['assets'])) return { projectAssetIds, recordingIds };
  for (const rawAsset of project['assets']) {
    if (!isRecord(rawAsset) || !isRecord(rawAsset['source'])) continue;
    const assetSource = rawAsset['source'];
    if (assetSource['kind'] === 'recording') {
      const id = readString(assetSource['recordingId']);
      if (id) recordingIds.add(id);
    }
    if (assetSource['kind'] === 'project-asset') {
      const id = readString(assetSource['projectAssetId']);
      const originId = readString(assetSource['originRecordingId']);
      if (id) projectAssetIds.add(id);
      if (originId) recordingIds.add(originId);
    }
  }
  return { projectAssetIds, recordingIds };
}

function readMediaSource(value: unknown): Record<string, unknown> | null {
  return isRecord(value) && isRecord(value['source']) ? value['source'] : null;
}

function isTemporaryMedia(value: unknown): boolean {
  return (
    isRecord(value) &&
    isRecord(value['lifecycle']) &&
    value['lifecycle']['storageClass'] === 'temporary'
  );
}

async function deleteKeys(store: UpgradeObjectStore, keys: Iterable<IDBValidKey>): Promise<void> {
  for (const key of keys) await store.delete(key);
}

function createAssetStores(db: UpgradeDatabase): void {
  const refs = db.createObjectStore(ASSET_REFS_STORE, { keyPath: 'assetId' });
  refs.createIndex('createdAt', 'createdAt');
  const owners = db.createObjectStore(ASSET_OWNERS_STORE, {
    keyPath: ['ownerKind', 'ownerId', 'role'],
  });
  owners.createIndex('assetId', 'assetId');
  const operations = db.createObjectStore(ASSET_OPERATIONS_STORE, { keyPath: 'operationId' });
  operations.createIndex('status', 'status');
  operations.createIndex('updatedAt', 'updatedAt');
}

function collectInvalidExportIds(
  exports: unknown[],
  legacyRecordingIds: ReadonlySet<string>
): Set<string> {
  const invalidExportIds = new Set<string>();
  for (const rawExport of exports) {
    if (!isRecord(rawExport)) continue;
    const exportId = readId(rawExport);
    const recordingId = readString(rawExport['recordingId']);
    if (exportId && recordingId && legacyRecordingIds.has(recordingId)) {
      invalidExportIds.add(exportId);
    }
  }
  return invalidExportIds;
}

function classifyProjects(
  projects: unknown[],
  legacyRecordingIds: ReadonlySet<string>
): {
  invalidProjectAssetIds: Set<string>;
  invalidProjectIds: Set<string>;
  protectedProjectAssetIds: Set<string>;
} {
  const invalidProjectAssetIds = new Set<string>();
  const invalidProjectIds = new Set<string>();
  const protectedProjectAssetIds = new Set<string>();
  for (const project of projects) {
    const refs = readProjectReferences(project);
    const invalid = [...refs.recordingIds].some((id) => legacyRecordingIds.has(id));
    const projectId = readId(project);
    const targetAssets = invalid && projectId ? invalidProjectAssetIds : protectedProjectAssetIds;
    if (invalid && projectId) invalidProjectIds.add(projectId);
    refs.projectAssetIds.forEach((id) => targetAssets.add(id));
  }
  return { invalidProjectAssetIds, invalidProjectIds, protectedProjectAssetIds };
}

function classifyMediaEntries(
  mediaEntries: unknown[],
  invalidExportIds: ReadonlySet<string>,
  invalidProjectAssetIds: ReadonlySet<string>,
  protectedProjectAssetIds: Set<string>
): { mediaIdsToDelete: Set<string>; temporaryProjectAssetIdsToDelete: Set<string> } {
  const mediaIdsToDelete = new Set<string>();
  const temporaryProjectAssetIdsToDelete = new Set<string>();
  for (const entry of mediaEntries) {
    const source = readMediaSource(entry);
    const mediaId = readId(entry);
    if (!source || !mediaId) continue;
    if (source['kind'] === 'recording') {
      mediaIdsToDelete.add(mediaId);
    } else if (source['kind'] === 'project-export') {
      const exportId = readString(source['exportId']);
      if (exportId && invalidExportIds.has(exportId)) mediaIdsToDelete.add(mediaId);
    } else if (source['kind'] === 'project-asset') {
      const assetId = readString(source['projectAssetId']);
      if (!assetId || !invalidProjectAssetIds.has(assetId)) continue;
      if (!isTemporaryMedia(entry)) protectedProjectAssetIds.add(assetId);
      if (isTemporaryMedia(entry) && !protectedProjectAssetIds.has(assetId)) {
        temporaryProjectAssetIdsToDelete.add(assetId);
        mediaIdsToDelete.add(mediaId);
      }
    }
  }
  return { mediaIdsToDelete, temporaryProjectAssetIdsToDelete };
}

async function clearLegacyRecordingAuthorities(
  transaction: UpgradeTransaction,
  recordingStore: UpgradeObjectStore
): Promise<void> {
  await Promise.all([
    recordingStore.clear(),
    transaction.objectStore(RECORDING_TELEMETRY_STORE).clear(),
    transaction.objectStore(DIAGNOSTICS_META_STORE).clear(),
    transaction.objectStore(DIAGNOSTICS_EVENTS_STORE).clear(),
    transaction.objectStore(STATE_MANAGER_STORE).delete(COMPLETION_OUTBOX_KEY),
  ]);
}

async function deleteInvalidRecordingGraph(
  transaction: UpgradeTransaction,
  input: {
    invalidExportIds: Set<string>;
    invalidProjectIds: Set<string>;
    mediaIdsToDelete: Set<string>;
    temporaryProjectAssetIdsToDelete: Set<string>;
  }
): Promise<void> {
  await deleteKeys(transaction.objectStore(PROJECT_EXPORTS_STORE), input.invalidExportIds);
  await deleteKeys(transaction.objectStore(VIDEO_PROJECTS_STORE), input.invalidProjectIds);
  await deleteKeys(transaction.objectStore(MEDIA_LIBRARY_STORE), input.mediaIdsToDelete);
  await deleteKeys(
    transaction.objectStore(PROJECT_ASSETS_STORE),
    input.temporaryProjectAssetIdsToDelete
  );
  const thumbnailKeys: IDBValidKey[] = [...input.mediaIdsToDelete];
  for (const id of input.invalidExportIds) thumbnailKeys.push(`export:${id}`);
  for (const id of input.invalidProjectIds) thumbnailKeys.push(`video-project:${id}`);
  await deleteKeys(transaction.objectStore(THUMBNAILS_STORE), thumbnailKeys);
  await deleteKeys(
    transaction.objectStore(AGGREGATE_PRESENTATIONS_STORE),
    [...input.invalidProjectIds].map((id) => ['video-project', id])
  );
}

export async function applyRecordingAssetsV26Upgrade(
  db: UpgradeDatabase,
  oldVersion: number,
  transaction?: UpgradeTransaction
): Promise<void> {
  if (oldVersion >= 26) return;
  createAssetStores(db);
  if (oldVersion === 0) return;
  if (!transaction) throw new Error('Recording asset upgrade transaction is unavailable.');

  const recordingStore = transaction.objectStore(STORE_NAME);
  const projectStore = transaction.objectStore(VIDEO_PROJECTS_STORE);
  const mediaStore = transaction.objectStore(MEDIA_LIBRARY_STORE);
  const exportStore = transaction.objectStore(PROJECT_EXPORTS_STORE);
  const [recordings, projects, mediaEntries, exports] = await Promise.all([
    recordingStore.getAll(),
    projectStore.getAll(),
    mediaStore.getAll(),
    exportStore.getAll(),
  ]);
  const legacyRecordingIds = new Set(recordings.map(readId).filter((id): id is string => !!id));
  const invalidExportIds = collectInvalidExportIds(exports, legacyRecordingIds);
  const projectClassification = classifyProjects(projects, legacyRecordingIds);
  const mediaClassification = classifyMediaEntries(
    mediaEntries,
    invalidExportIds,
    projectClassification.invalidProjectAssetIds,
    projectClassification.protectedProjectAssetIds
  );
  await clearLegacyRecordingAuthorities(transaction, recordingStore);
  await deleteInvalidRecordingGraph(transaction, {
    invalidExportIds,
    invalidProjectIds: projectClassification.invalidProjectIds,
    ...mediaClassification,
  });
}
