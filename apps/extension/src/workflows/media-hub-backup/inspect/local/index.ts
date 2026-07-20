import {
  SCENARIO_PROJECTS_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
  THUMBNAILS_STORE,
  VIDEO_PROJECTS_STORE,
  initDB,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import { listMediaLibrary } from '../../../../composition/persistence/media-library/index';
import type { MediaThumbnailEntry } from '../../../../composition/persistence/media-library/contracts';
import type { ScenarioStepEditorDocumentEntry } from '../../../../composition/persistence/scenario/contracts';
import { parseDbEntries } from '../../../../composition/persistence/infrastructure/indexed-db/read-primitives';
import { parseScenarioProjectEntry } from '../../../../composition/persistence/scenario/read-guards';
import { parseVideoProjectEntry } from '../../../../composition/persistence/projects/read-guards';
import {
  createMediaHubBackupDataClassFlags,
  createMediaHubBackupExportOptions,
} from '../../export/options';
import {
  shouldExportMediaEntry,
  shouldExportScenarioProject,
  shouldExportVideoProject,
} from '../../export/filters';
import { hasBackupSourceMetadata } from '../../export/privacy';
import { inspectProjectOwnedBackupEntries } from './projects';
import type {
  MediaHubBackupExportOptions,
  MediaHubLocalBackupSummary,
} from '../../contracts/types';

interface LocalBackupInspectionEntries {
  editorDraftCount: number;
  mediaItems: Awaited<ReturnType<typeof listMediaLibrary>>;
  projectRecordingCount: number;
  projectSourceMetadataCount: number;
  projectTelemetryCount: number;
  scenarioProjectCount: number;
  thumbnails: MediaThumbnailEntry[];
  videoProjectCount: number;
  projectSizeBytes: number;
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

function hasScenarioStepDocumentProjectId(value: unknown): value is { projectId: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'projectId' in value &&
    typeof value.projectId === 'string'
  );
}

async function loadLocalBackupInspectionEntries(
  options: MediaHubBackupExportOptions
): Promise<LocalBackupInspectionEntries> {
  const [items, db] = await Promise.all([listMediaLibrary(), initDB()]);
  const mediaItems = items.filter((entry) => shouldExportMediaEntry(entry, options));
  const [videoProjectEntries, scenarioProjectEntries, stepDocuments, thumbnails] =
    await Promise.all([
      db.getAll(VIDEO_PROJECTS_STORE),
      db.getAll(SCENARIO_PROJECTS_STORE),
      db.getAll(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE),
      db.getAll(THUMBNAILS_STORE),
    ]);
  const videoProjects = parseDbEntries(videoProjectEntries, parseVideoProjectEntry).filter(
    (entry) => shouldExportVideoProject(entry, options)
  );
  const scenarioProjects = parseDbEntries(scenarioProjectEntries, parseScenarioProjectEntry).filter(
    (entry) => shouldExportScenarioProject(entry, options)
  );
  const exportedMediaIds = new Set(mediaItems.map((entry) => entry.id));
  const exportedThumbnails = thumbnails.filter(
    (entry): entry is MediaThumbnailEntry =>
      isMediaThumbnailEntry(entry) && exportedMediaIds.has(entry.assetId)
  );
  const exportedScenarioProjectIds = new Set(scenarioProjects.map((entry) => entry.id));
  const exportedStepDocuments = options.includeEditorDrafts
    ? (stepDocuments.filter(
        (entry) =>
          hasScenarioStepDocumentProjectId(entry) && exportedScenarioProjectIds.has(entry.projectId)
      ) as ScenarioStepEditorDocumentEntry[])
    : [];
  const projectInventory = await inspectProjectOwnedBackupEntries({
    db,
    options,
    scenarioProjects,
    stepDocuments: exportedStepDocuments,
    videoProjects,
  });

  return {
    editorDraftCount: exportedStepDocuments.length,
    mediaItems,
    projectRecordingCount: projectInventory.recordingCount,
    projectSizeBytes: projectInventory.sizeBytes,
    projectSourceMetadataCount: projectInventory.sourceMetadataCount,
    projectTelemetryCount: projectInventory.telemetryCount,
    scenarioProjectCount: scenarioProjects.length,
    thumbnails: [...exportedThumbnails, ...projectInventory.thumbnails],
    videoProjectCount: videoProjects.length,
  };
}

function buildLocalBackupSummary(
  entries: LocalBackupInspectionEntries,
  options: MediaHubBackupExportOptions
): MediaHubLocalBackupSummary {
  const { editorDraftCount, mediaItems, thumbnails } = entries;
  const approximateSizeBytes =
    mediaItems.reduce((total, entry) => total + entry.size, 0) +
    thumbnails.reduce((total, entry) => total + entry.blob.size, 0) +
    entries.projectSizeBytes;
  const sourceMetadataCount = options.includeSourceMetadata
    ? mediaItems.filter(hasBackupSourceMetadata).length + entries.projectSourceMetadataCount
    : 0;
  const recordingCount =
    mediaItems.filter(
      (entry) => entry.source.kind === 'recording' || entry.source.kind === 'project-export'
    ).length + entries.projectRecordingCount;
  const telemetryCount =
    mediaItems.filter((entry) => entry.source.kind === 'recording').length +
    entries.projectTelemetryCount;

  return {
    approximateSizeBytes,
    assetCount: mediaItems.length,
    dataClasses: createMediaHubBackupDataClassFlags(options, {
      editorDraftCount,
      mediaAssetCount: mediaItems.length,
      recordingCount,
      scenarioProjectCount: entries.scenarioProjectCount,
      sourceMetadataCount,
      telemetryCount,
      thumbnailCount: thumbnails.length,
      videoProjectCount: entries.videoProjectCount,
      webSnapshotCount: mediaItems.filter((entry) => entry.source.kind === 'web-snapshot').length,
    }),
    editorDraftCount,
    recordingCount,
    scenarioProjectCount: entries.scenarioProjectCount,
    selectedCount:
      options.scope === 'selected'
        ? (options.selected?.mediaAssetIds.length ?? 0) +
          (options.selected?.scenarioProjectIds.length ?? 0) +
          (options.selected?.videoProjectIds.length ?? 0)
        : 0,
    sourceMetadataCount,
    thumbnailCount: thumbnails.length,
    videoProjectCount: entries.videoProjectCount,
    webSnapshotCount: mediaItems.filter((entry) => entry.source.kind === 'web-snapshot').length,
  };
}

export async function inspectLocalMediaHubBackup(
  rawOptions: Partial<MediaHubBackupExportOptions> = {}
): Promise<MediaHubLocalBackupSummary> {
  const options = createMediaHubBackupExportOptions(rawOptions);
  return buildLocalBackupSummary(await loadLocalBackupInspectionEntries(options), options);
}
