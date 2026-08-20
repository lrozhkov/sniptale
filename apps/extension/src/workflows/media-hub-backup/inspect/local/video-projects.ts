import {
  ASSET_REFS_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  THUMBNAILS_STORE,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import { parseAssetRef, readAssetFile } from '../../../../composition/persistence/assets';
import type { MediaThumbnailEntry } from '../../../../composition/persistence/media-library/contracts';
import type {
  StoredProjectExportEntry,
  VideoProjectEntry,
} from '../../../../composition/persistence/projects/contracts';
import {
  parseProjectAssetEntry,
  parseProjectExportEntry,
} from '../../../../composition/persistence/projects/read-guards';
import type { initDB } from '../../../../composition/persistence/infrastructure/indexed-db/core';
import type { MediaHubBackupExportOptions } from '../../contracts/types';

type LocalBackupDb = Awaited<ReturnType<typeof initDB>>;

interface VideoProjectBackupInspection {
  recordingCount: number;
  sizeBytes: number;
  telemetryCount: number;
  thumbnails: MediaThumbnailEntry[];
}

function isMediaThumbnailEntry(value: unknown): value is MediaThumbnailEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    'assetId' in value &&
    typeof value.assetId === 'string' &&
    'blob' in value &&
    value.blob instanceof Blob
  );
}

function getJsonSizeBytes(value: unknown): number {
  return new Blob([JSON.stringify(value)]).size;
}

export async function inspectVideoProjectBackupEntries(
  db: LocalBackupDb,
  videoProjects: VideoProjectEntry[],
  options: MediaHubBackupExportOptions
): Promise<VideoProjectBackupInspection> {
  const inventory: VideoProjectBackupInspection = {
    recordingCount: 0,
    sizeBytes: 0,
    telemetryCount: 0,
    thumbnails: [],
  };

  for (const project of videoProjects) {
    await inspectVideoProjectEntry(db, project, options, inventory);
  }

  return inventory;
}

async function inspectVideoProjectEntry(
  db: LocalBackupDb,
  project: VideoProjectEntry,
  options: MediaHubBackupExportOptions,
  inventory: VideoProjectBackupInspection
): Promise<void> {
  inventory.sizeBytes += getJsonSizeBytes(project);

  await inspectVideoProjectAssets(db, project, inventory);
  await inspectVideoProjectExports(db, project, options, inventory);
}

async function inspectVideoProjectAssets(
  db: LocalBackupDb,
  project: VideoProjectEntry,
  inventory: VideoProjectBackupInspection
): Promise<void> {
  for (const assetId of project.project.assets.flatMap((asset) =>
    asset.source.kind === 'project-asset' ? [asset.source.projectAssetId] : []
  )) {
    const asset = parseProjectAssetEntry(await db.get(PROJECT_ASSETS_STORE, assetId));
    if (!asset) continue;
    const ref = parseAssetRef(await db.get(ASSET_REFS_STORE, asset.assetId));
    if (!ref) throw new Error(`Project asset reference is missing: ${asset.id}.`);
    await readAssetFile(ref, asset.id);
    inventory.sizeBytes += ref.size;
  }
}

async function inspectVideoProjectExports(
  db: LocalBackupDb,
  project: VideoProjectEntry,
  options: MediaHubBackupExportOptions,
  inventory: VideoProjectBackupInspection
): Promise<void> {
  const projectExports = (await db.getAllFromIndex(PROJECT_EXPORTS_STORE, 'projectId', project.id))
    .map(parseProjectExportEntry)
    .filter((entry): entry is StoredProjectExportEntry => entry !== null);

  for (const projectExport of projectExports) {
    await inspectVideoProjectExport(db, projectExport, options, inventory);
  }
}

async function inspectVideoProjectExport(
  db: LocalBackupDb,
  projectExport: StoredProjectExportEntry,
  options: MediaHubBackupExportOptions,
  inventory: VideoProjectBackupInspection
): Promise<void> {
  const ref = parseAssetRef(await db.get(ASSET_REFS_STORE, projectExport.assetId));
  if (!ref) throw new Error(`Project export asset reference is missing: ${projectExport.id}.`);
  await readAssetFile(ref, projectExport.filename);
  inventory.recordingCount += 1;
  inventory.sizeBytes += ref.size;

  const exportThumbnail = await getThumbnail(db, `export:${projectExport.id}`);
  if (exportThumbnail) {
    inventory.thumbnails.push(exportThumbnail);
  }

  void options;
}

async function getThumbnail(db: LocalBackupDb, key: string): Promise<MediaThumbnailEntry | null> {
  const thumbnail: unknown = await db.get(THUMBNAILS_STORE, key);
  return isMediaThumbnailEntry(thumbnail) ? thumbnail : null;
}
