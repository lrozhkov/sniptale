import {
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  RECORDING_TELEMETRY_STORE,
  STORE_NAME,
  THUMBNAILS_STORE,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import type { MediaThumbnailEntry } from '../../../../composition/persistence/media-library/contracts';
import type {
  ProjectAssetEntry,
  ProjectExportEntry,
  VideoProjectEntry,
} from '../../../../composition/persistence/projects/contracts';
import type {
  RecordingEntry,
  RecordingTelemetryEntry,
} from '../../../../composition/persistence/recordings/contracts';
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

function isProjectAssetEntry(value: unknown): value is ProjectAssetEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    'blob' in value &&
    value.blob instanceof Blob &&
    'size' in value &&
    typeof value.size === 'number'
  );
}

function isRecordingEntry(value: unknown): value is RecordingEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    'blob' in value &&
    value.blob instanceof Blob &&
    'size' in value &&
    typeof value.size === 'number'
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
  const thumbnail = await getThumbnail(db, `video-project:${project.id}`);
  if (thumbnail) {
    inventory.thumbnails.push(thumbnail);
  }

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
    const asset: unknown = await db.get(PROJECT_ASSETS_STORE, assetId);
    if (isProjectAssetEntry(asset)) {
      inventory.sizeBytes += asset.size;
    }
  }
}

async function inspectVideoProjectExports(
  db: LocalBackupDb,
  project: VideoProjectEntry,
  options: MediaHubBackupExportOptions,
  inventory: VideoProjectBackupInspection
): Promise<void> {
  const projectExports = (await db.getAllFromIndex(
    PROJECT_EXPORTS_STORE,
    'projectId',
    project.id
  )) as ProjectExportEntry[];

  for (const projectExport of projectExports) {
    await inspectVideoProjectExport(db, projectExport, options, inventory);
  }
}

async function inspectVideoProjectExport(
  db: LocalBackupDb,
  projectExport: ProjectExportEntry,
  options: MediaHubBackupExportOptions,
  inventory: VideoProjectBackupInspection
): Promise<void> {
  const recording: unknown = await db.get(STORE_NAME, projectExport.recordingId);
  if (isRecordingEntry(recording)) {
    inventory.recordingCount += 1;
    inventory.sizeBytes += recording.size;
  }

  const exportThumbnail = await getThumbnail(db, `export:${projectExport.id}`);
  if (exportThumbnail) {
    inventory.thumbnails.push(exportThumbnail);
  }

  if (options.includeTelemetry) {
    await inspectVideoProjectExportTelemetry(db, projectExport, inventory);
  }
}

async function inspectVideoProjectExportTelemetry(
  db: LocalBackupDb,
  projectExport: ProjectExportEntry,
  inventory: VideoProjectBackupInspection
): Promise<void> {
  const value: unknown = await db.get(RECORDING_TELEMETRY_STORE, projectExport.recordingId);
  const telemetry = value as RecordingTelemetryEntry | undefined;
  if (telemetry) {
    inventory.telemetryCount += 1;
    inventory.sizeBytes += getJsonSizeBytes(telemetry);
  }
}

async function getThumbnail(db: LocalBackupDb, key: string): Promise<MediaThumbnailEntry | null> {
  const thumbnail: unknown = await db.get(THUMBNAILS_STORE, key);
  return isMediaThumbnailEntry(thumbnail) ? thumbnail : null;
}
