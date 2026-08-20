import {
  createDirectFileSink,
  type ArchiveTransferProgress,
} from '../../../composition/archive-transfer';
import {
  initDB,
  MEDIA_LIBRARY_STORE,
  SCENARIO_PROJECTS_STORE,
  VIDEO_EFFECT_BUNDLES_STORE,
  VIDEO_PROJECTS_STORE,
} from '../../../composition/persistence/infrastructure/indexed-db/core';
import type { ArchiveRestoreStrategy } from '../../../composition/persistence/assets';
import { recoverAssetPublications } from '../../../composition/persistence/asset-publication-recovery';
import { translate } from '../../../platform/i18n';
import { createMediaHubBackupExportOptions } from './options';
import type { MediaHubBackupExportOptions, MediaHubLocalBackupSummary } from './contracts';
import { buildMediaHubBackupExportPlanFromLibraryV6 } from './inventory';
import { exportMediaHubBackupV6 } from './export';
import { inspectMediaHubBackupV6 } from './inspect';
import { createMediaHubRestoreSession } from './restore-session';
export { abortMediaHubBackupRestore, listResumableMediaHubRestores } from './restore-session';
import { restoreMediaHubBackupV6 } from './restore';
import { effectBundleRootPublisher } from './root-publication/effect-bundle';
import { mediaLibraryRootPublisher } from './root-publication/media';
import { scenarioProjectRootPublisher } from './root-publication/scenario-project';
import { videoProjectRootPublisher } from './root-publication/video-project';

export type MediaHubImportConflictStrategy = ArchiveRestoreStrategy;

export interface MediaHubBackupSummaryV6 {
  archiveFingerprint: string;
  assetCount: number;
  conflicts: string[];
  manifest: {
    [key: string]: unknown;
    exportedAt: string;
    format: string;
    version: number;
  };
  thumbnailCount: number;
}

export interface MediaHubImportResultV6 {
  conflictsResolved: number;
  imported: number;
  operationId: string;
  skipped: number;
}

function defaultFilename() {
  return `media-hub-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
}

export async function inspectLocalMediaHubBackup(
  rawOptions: Partial<MediaHubBackupExportOptions> = {}
): Promise<MediaHubLocalBackupSummary> {
  await recoverAssetPublications();
  const options = createMediaHubBackupExportOptions(rawOptions);
  const plan = await buildMediaHubBackupExportPlanFromLibraryV6(options);
  const summary = plan.roots.reduce(
    (total, root) => ({
      recordingCount: total.recordingCount + root.summary.recordingCount,
      sourceMetadataCount: total.sourceMetadataCount + root.summary.sourceMetadataCount,
      telemetryCount: total.telemetryCount + root.summary.telemetryCount,
      thumbnailCount: total.thumbnailCount + root.summary.thumbnailCount,
      webSnapshotCount: total.webSnapshotCount + root.summary.webSnapshotCount,
    }),
    {
      recordingCount: 0,
      sourceMetadataCount: 0,
      telemetryCount: 0,
      thumbnailCount: 0,
      webSnapshotCount: 0,
    }
  );
  const { rootsByProfile } = plan.manifest.totals;
  return {
    approximateSizeBytes: plan.manifest.totals.bytes,
    assetCount: rootsByProfile.libraryItems,
    dataClasses: {
      mediaAssets: rootsByProfile.libraryItems > 0,
      recordings: summary.recordingCount > 0,
      scenarioProjects: rootsByProfile.scenarioProjects > 0,
      sourceMetadata: options.includeSourceMetadata && summary.sourceMetadataCount > 0,
      telemetry: options.includeTelemetry && summary.telemetryCount > 0,
      thumbnails: summary.thumbnailCount > 0,
      videoProjects: rootsByProfile.videoProjects > 0,
      webSnapshots: options.includeWebSnapshots && summary.webSnapshotCount > 0,
    },
    recordingCount: summary.recordingCount,
    scenarioProjectCount: rootsByProfile.scenarioProjects,
    selectedCount:
      options.scope === 'selected'
        ? (options.selected?.mediaAssetIds.length ?? 0) +
          (options.selected?.scenarioProjectIds.length ?? 0) +
          (options.selected?.videoProjectIds.length ?? 0)
        : 0,
    sourceMetadataCount: summary.sourceMetadataCount,
    thumbnailCount: summary.thumbnailCount,
    videoProjectCount: rootsByProfile.videoProjects,
    webSnapshotCount: summary.webSnapshotCount,
  };
}

export async function exportMediaHubBackup(
  rawOptions: Partial<MediaHubBackupExportOptions> = {},
  runtime: {
    filename?: string;
    onProgress?: (progress: ArchiveTransferProgress) => void;
    signal?: AbortSignal;
  } = {}
): Promise<void> {
  const options = createMediaHubBackupExportOptions(rawOptions);
  const sink = await createDirectFileSink({
    description: translate('gallery.backupExportModal.archiveDescription'),
    extension: '.zip',
    filename: runtime.filename ?? defaultFilename(),
    mimeType: 'application/zip',
  });
  try {
    const plan = await buildMediaHubBackupExportPlanFromLibraryV6(options);
    await exportMediaHubBackupV6({
      plan,
      sink,
      ...(runtime.onProgress ? { onProgress: runtime.onProgress } : {}),
      ...(runtime.signal ? { signal: runtime.signal } : {}),
    });
  } catch (error) {
    await sink.abort(error).catch(() => undefined);
    throw error;
  }
}

type PortablePackageRuntime = Parameters<typeof exportMediaHubBackup>[1];

export function exportVideoProjectPackage(
  projectId: string,
  runtime: PortablePackageRuntime = {}
): Promise<void> {
  return exportMediaHubBackup(
    {
      includeSourceMetadata: true,
      includeTelemetry: true,
      includeWebSnapshots: true,
      scope: 'selected',
      selected: { mediaAssetIds: [], scenarioProjectIds: [], videoProjectIds: [projectId] },
    },
    runtime
  );
}

export function exportScenarioProjectPackage(
  projectId: string,
  runtime: PortablePackageRuntime = {}
): Promise<void> {
  return exportMediaHubBackup(
    {
      includeSourceMetadata: true,
      includeTelemetry: true,
      includeWebSnapshots: true,
      scope: 'selected',
      selected: { mediaAssetIds: [], scenarioProjectIds: [projectId], videoProjectIds: [] },
    },
    runtime
  );
}

export const importPortableMediaPackage = importMediaHubBackup;

function keyParts(key: string) {
  for (const prefix of [
    'media:library-item:',
    'media:effect-bundle:',
    'video-project:',
    'scenario-project:',
  ]) {
    if (key.startsWith(prefix)) return { id: key.slice(prefix.length), prefix };
  }
  throw new Error('Inspected media backup root identity is invalid.');
}

export async function inspectMediaHubBackup(file: Blob): Promise<MediaHubBackupSummaryV6> {
  const inspection = await inspectMediaHubBackupV6(file);
  const db = await initDB();
  const conflicts: string[] = [];
  for (const key of inspection.rootKeys) {
    const { id, prefix } = keyParts(key);
    const store =
      prefix === 'media:library-item:'
        ? MEDIA_LIBRARY_STORE
        : prefix === 'media:effect-bundle:'
          ? VIDEO_EFFECT_BUNDLES_STORE
          : prefix === 'video-project:'
            ? VIDEO_PROJECTS_STORE
            : SCENARIO_PROJECTS_STORE;
    if (await db.get(store, id)) conflicts.push(key);
  }
  return {
    archiveFingerprint: inspection.fingerprint,
    assetCount: inspection.manifest.totals.rootsByProfile.libraryItems,
    conflicts,
    manifest: {
      exportedAt: inspection.manifest.exportedAt,
      format: inspection.manifest.format,
      version: inspection.manifest.version,
    },
    thumbnailCount: inspection.thumbnailCount,
  };
}

export async function importMediaHubBackup(
  file: Blob,
  strategy: MediaHubImportConflictStrategy,
  runtime: {
    onProgress?: (progress: ArchiveTransferProgress) => void;
    signal?: AbortSignal;
  } = {}
): Promise<MediaHubImportResultV6> {
  const { session } = await createMediaHubRestoreSession({ file, strategy });
  const completed = await restoreMediaHubBackupV6({
    file,
    operationId: session.operationId,
    publishers: [
      mediaLibraryRootPublisher,
      effectBundleRootPublisher,
      videoProjectRootPublisher,
      scenarioProjectRootPublisher,
    ],
    ...(runtime.signal ? { signal: runtime.signal } : {}),
    ...(runtime.onProgress ? { onProgress: runtime.onProgress } : {}),
  });
  return {
    conflictsResolved: completed.conflictedRoots.length,
    imported: completed.committedRoots.length - completed.skippedRoots.length,
    operationId: completed.operationId,
    skipped: completed.skippedRoots.length,
  };
}

export async function resumeMediaHubBackupImport(args: {
  file: Blob;
  operationId: string;
  onProgress?: (progress: ArchiveTransferProgress) => void;
  signal?: AbortSignal;
}): Promise<MediaHubImportResultV6> {
  const completed = await restoreMediaHubBackupV6({
    file: args.file,
    operationId: args.operationId,
    publishers: [
      mediaLibraryRootPublisher,
      effectBundleRootPublisher,
      videoProjectRootPublisher,
      scenarioProjectRootPublisher,
    ],
    ...(args.signal ? { signal: args.signal } : {}),
    ...(args.onProgress ? { onProgress: args.onProgress } : {}),
  });
  return {
    conflictsResolved: completed.conflictedRoots.length,
    imported: completed.committedRoots.length - completed.skippedRoots.length,
    operationId: completed.operationId,
    skipped: completed.skippedRoots.length,
  };
}
