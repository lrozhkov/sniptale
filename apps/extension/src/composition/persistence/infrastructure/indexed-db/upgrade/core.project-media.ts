import {
  AGGREGATE_PRESENTATIONS_STORE,
  ASSET_OPERATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  RECORDING_TELEMETRY_STORE,
  STORE_NAME,
  THUMBNAILS_STORE,
  VIDEO_PROJECTS_STORE,
} from '../core.stores.ts';
import type { UpgradeObjectStore, UpgradeTransaction } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readId(value: unknown): string | null {
  return isRecord(value) ? readString(value['id']) : null;
}

function collectProjectAssetReferences(project: unknown): Set<string> {
  const ids = new Set<string>();
  if (!isRecord(project) || !isRecord(project['project'])) return ids;
  const assets = project['project']['assets'];
  if (!Array.isArray(assets)) return ids;
  for (const asset of assets) {
    if (!isRecord(asset) || !isRecord(asset['source'])) continue;
    if (asset['source']['kind'] !== 'project-asset') continue;
    const id = readString(asset['source']['projectAssetId']);
    if (id) ids.add(id);
  }
  return ids;
}

async function deleteKeys(store: UpgradeObjectStore, keys: Iterable<IDBValidKey>): Promise<void> {
  for (const key of keys) await store.delete(key);
}

function collectIds(entries: unknown[]): Set<string> {
  return new Set(entries.map(readId).filter((id): id is string => id !== null));
}

function collectLegacyExportRecordingIds(entries: unknown[]): Set<string> {
  return new Set(
    entries
      .map((entry) => (isRecord(entry) ? readString(entry['recordingId']) : null))
      .filter((id): id is string => id !== null)
  );
}

function collectLegacyRecordingAssets(
  recordings: unknown[],
  legacyRecordingIds: ReadonlySet<string>
): Map<string, string> {
  const assets = new Map<string, string>();
  for (const recording of recordings) {
    const id = readId(recording);
    const assetId = isRecord(recording) ? readString(recording['assetId']) : null;
    if (id && assetId && legacyRecordingIds.has(id)) assets.set(id, assetId);
  }
  return assets;
}

function collectInvalidProjectIds(
  projects: unknown[],
  legacyProjectAssetIds: ReadonlySet<string>
): Set<string> {
  const ids = new Set<string>();
  for (const project of projects) {
    const projectId = readId(project);
    if (
      projectId &&
      [...collectProjectAssetReferences(project)].some((id) => legacyProjectAssetIds.has(id))
    ) {
      ids.add(projectId);
    }
  }
  return ids;
}

function collectLegacyMediaIds(args: {
  entries: unknown[];
  projectAssetIds: ReadonlySet<string>;
  projectExportIds: ReadonlySet<string>;
  recordingIds: ReadonlySet<string>;
}): Set<string> {
  const ids = new Set<string>();
  for (const media of args.entries) {
    if (!isRecord(media) || !isRecord(media['source'])) continue;
    const mediaId = readId(media);
    const source = media['source'];
    if (!mediaId) continue;
    if (
      (source['kind'] === 'project-asset' &&
        args.projectAssetIds.has(readString(source['projectAssetId']) ?? '')) ||
      (source['kind'] === 'project-export' &&
        args.projectExportIds.has(readString(source['exportId']) ?? '')) ||
      (source['kind'] === 'recording' &&
        args.recordingIds.has(readString(source['recordingId']) ?? ''))
    ) {
      ids.add(mediaId);
    }
  }
  return ids;
}

async function scheduleObsoleteAssetDeletion(
  transaction: UpgradeTransaction,
  assetIds: Iterable<string>
): Promise<void> {
  const obsoleteAssetIds = [...new Set(assetIds)];
  if (obsoleteAssetIds.length === 0) return;
  const now = Date.now();
  const operationStore = transaction.objectStore(ASSET_OPERATIONS_STORE);
  if (!operationStore.put) throw new Error('Asset operation upgrade store is not writable.');
  await operationStore.put({
    assetIds: obsoleteAssetIds,
    createdAt: now,
    kind: 'physical-delete',
    operationId: 'v27-project-media-reset',
    status: 'pending',
    updatedAt: now,
  });
}

export async function applyProjectMediaV27Upgrade(
  oldVersion: number,
  transaction?: UpgradeTransaction
): Promise<void> {
  if (oldVersion >= 27 || oldVersion === 0) return;
  if (!transaction) throw new Error('Project media upgrade transaction is unavailable.');

  const projectAssetStore = transaction.objectStore(PROJECT_ASSETS_STORE);
  const projectExportStore = transaction.objectStore(PROJECT_EXPORTS_STORE);
  const recordingStore = transaction.objectStore(STORE_NAME);
  const [projectAssets, projectExports, projects, recordings, mediaEntries] = await Promise.all([
    projectAssetStore.getAll(),
    projectExportStore.getAll(),
    transaction.objectStore(VIDEO_PROJECTS_STORE).getAll(),
    recordingStore.getAll(),
    transaction.objectStore(MEDIA_LIBRARY_STORE).getAll(),
  ]);
  const legacyProjectAssetIds = collectIds(projectAssets);
  const legacyProjectExportIds = collectIds(projectExports);
  const legacyExportRecordingIds = collectLegacyExportRecordingIds(projectExports);
  const recordingAssetIds = collectLegacyRecordingAssets(recordings, legacyExportRecordingIds);
  const invalidProjectIds = collectInvalidProjectIds(projects, legacyProjectAssetIds);
  const mediaIds = collectLegacyMediaIds({
    entries: mediaEntries,
    projectAssetIds: legacyProjectAssetIds,
    projectExportIds: legacyProjectExportIds,
    recordingIds: legacyExportRecordingIds,
  });

  await Promise.all([projectAssetStore.clear(), projectExportStore.clear()]);
  await deleteKeys(transaction.objectStore(VIDEO_PROJECTS_STORE), invalidProjectIds);
  await deleteKeys(recordingStore, legacyExportRecordingIds);
  await deleteKeys(transaction.objectStore(RECORDING_TELEMETRY_STORE), legacyExportRecordingIds);
  await deleteKeys(transaction.objectStore(MEDIA_LIBRARY_STORE), mediaIds);
  await deleteKeys(transaction.objectStore(THUMBNAILS_STORE), [
    ...mediaIds,
    ...[...invalidProjectIds].map((id) => `video-project:${id}`),
  ]);
  await deleteKeys(
    transaction.objectStore(AGGREGATE_PRESENTATIONS_STORE),
    [...invalidProjectIds].map((id) => ['video-project', id])
  );
  const ownerStore = transaction.objectStore(ASSET_OWNERS_STORE);
  const refStore = transaction.objectStore(ASSET_REFS_STORE);
  for (const [recordingId, assetId] of recordingAssetIds) {
    await ownerStore.delete(['recording', recordingId, 'body']);
    await refStore.delete(assetId);
  }
  await scheduleObsoleteAssetDeletion(transaction, recordingAssetIds.values());
}
