import {
  SCENARIO_PROJECTS_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
  THUMBNAILS_STORE,
  VIDEO_PROJECTS_STORE,
  IMAGE_WORKSPACES_STORE,
  AGGREGATE_PRESENTATIONS_STORE,
  initDB,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import { listMediaLibrary } from '../../../../composition/persistence/media-library/index';
import type { MediaThumbnailEntry } from '../../../../composition/persistence/media-library/contracts';
import type { StoredScenarioStepEditorDocumentEntry } from '../../../../composition/persistence/scenario/contracts';
import { parseImageWorkspaceEntry } from '../../../../composition/persistence/image-workspaces/parser';
import { parseAggregatePresentationEntry } from '../../../../composition/persistence/aggregate-presentations/parser';
import { serializeAggregateRef } from '../../../../composition/persistence/aggregate-presentations';
import type { AggregatePresentationEntry } from '../../../../composition/persistence/aggregate-presentations';
import type { StoredImageWorkspaceEntry } from '../../../../composition/persistence/image-workspaces/contracts';
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
import { hasBackupSourceMetadata, hasEditorDocumentSourceMetadata } from '../../export/privacy';
import { inspectProjectOwnedBackupEntries } from './projects';
import type {
  MediaHubBackupExportOptions,
  MediaHubLocalBackupSummary,
} from '../../contracts/types';
import { recoverAssetPublications } from '../../../../composition/persistence/asset-publication-recovery';

interface LocalBackupInspectionEntries {
  mediaItems: Awaited<ReturnType<typeof listMediaLibrary>>;
  projectRecordingCount: number;
  projectSourceMetadataCount: number;
  projectTelemetryCount: number;
  scenarioProjectCount: number;
  presentationPreviewSizeBytes: number;
  thumbnails: Array<Pick<MediaThumbnailEntry, 'blob'>>;
  videoProjectCount: number;
  projectSizeBytes: number;
  workspaceSizeBytes: number;
  workspaceSourceMetadataCount: number;
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
  const [
    videoProjectEntries,
    scenarioProjectEntries,
    stepDocuments,
    thumbnails,
    imageWorkspaces,
    aggregatePresentations,
  ] = await Promise.all([
    db.getAll(VIDEO_PROJECTS_STORE),
    db.getAll(SCENARIO_PROJECTS_STORE),
    db.getAll(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE),
    db.getAll(THUMBNAILS_STORE),
    db.getAll(IMAGE_WORKSPACES_STORE),
    db.getAll(AGGREGATE_PRESENTATIONS_STORE),
  ]);
  const videoProjects = parseDbEntries(videoProjectEntries, parseVideoProjectEntry).filter(
    (entry) => shouldExportVideoProject(entry, options)
  );
  const scenarioProjects = parseDbEntries(scenarioProjectEntries, parseScenarioProjectEntry).filter(
    (entry) => shouldExportScenarioProject(entry, options)
  );
  const exportedMediaIds = new Set(mediaItems.map((entry) => entry.id));
  const exportedImageAggregateIds = new Set(
    mediaItems
      .filter(
        (entry) =>
          entry.source.kind === 'screenshot' &&
          (entry.kind === 'image' || entry.kind === 'screenshot')
      )
      .map((entry) => entry.id)
  );
  const exportedThumbnails = thumbnails.filter(
    (entry): entry is MediaThumbnailEntry =>
      isMediaThumbnailEntry(entry) &&
      exportedMediaIds.has(entry.assetId) &&
      !exportedImageAggregateIds.has(entry.assetId)
  );
  const exportedScenarioProjectIds = new Set(scenarioProjects.map((entry) => entry.id));
  const exportedStepDocuments = stepDocuments.filter(
    (entry) =>
      hasScenarioStepDocumentProjectId(entry) && exportedScenarioProjectIds.has(entry.projectId)
  ) as StoredScenarioStepEditorDocumentEntry[];
  const projectInventory = await inspectProjectOwnedBackupEntries({
    db,
    options,
    scenarioProjects,
    stepDocuments: exportedStepDocuments,
    videoProjects,
  });
  const exportedAggregateRefs = new Set([
    ...Array.from(exportedImageAggregateIds, (id) => serializeAggregateRef({ id, kind: 'image' })),
    ...videoProjects.map((entry) => serializeAggregateRef({ id: entry.id, kind: 'video-project' })),
    ...scenarioProjects.map((entry) => serializeAggregateRef({ id: entry.id, kind: 'scenario' })),
  ]);
  const presentations = aggregatePresentations
    .map(parseAggregatePresentationEntry)
    .filter(
      (entry): entry is AggregatePresentationEntry =>
        entry !== null &&
        exportedAggregateRefs.has(
          serializeAggregateRef({ id: entry.aggregateId, kind: entry.aggregateKind })
        )
    );
  const exportedImageWorkspaces = imageWorkspaces
    .map(parseImageWorkspaceEntry)
    .filter(
      (entry): entry is StoredImageWorkspaceEntry =>
        entry !== null && exportedImageAggregateIds.has(entry.aggregateId)
    );
  const workspaceSizeBytes = exportedImageWorkspaces.reduce(
    (total, entry) => total + getJsonSizeBytes(entry),
    0
  );

  return {
    mediaItems,
    projectRecordingCount: projectInventory.recordingCount,
    projectSizeBytes: projectInventory.sizeBytes,
    projectSourceMetadataCount: projectInventory.sourceMetadataCount,
    projectTelemetryCount: projectInventory.telemetryCount,
    scenarioProjectCount: scenarioProjects.length,
    presentationPreviewSizeBytes: presentations.reduce(
      (total, entry) => total + (entry.previewBlob?.size ?? 0),
      0
    ),
    thumbnails: [
      ...exportedThumbnails,
      ...projectInventory.thumbnails,
      ...presentations.map((entry) => ({ blob: entry.thumbnailBlob })),
    ],
    videoProjectCount: videoProjects.length,
    workspaceSizeBytes,
    workspaceSourceMetadataCount: exportedImageWorkspaces.filter((entry) =>
      hasEditorDocumentSourceMetadata(entry.document)
    ).length,
  };
}

function getJsonSizeBytes(value: unknown): number {
  return new Blob([JSON.stringify(value)]).size;
}

function buildLocalBackupSummary(
  entries: LocalBackupInspectionEntries,
  options: MediaHubBackupExportOptions
): MediaHubLocalBackupSummary {
  const { mediaItems, thumbnails } = entries;
  const approximateSizeBytes =
    mediaItems.reduce((total, entry) => total + entry.size, 0) +
    thumbnails.reduce((total, entry) => total + entry.blob.size, 0) +
    entries.projectSizeBytes +
    entries.workspaceSizeBytes +
    entries.presentationPreviewSizeBytes;
  const sourceMetadataCount = options.includeSourceMetadata
    ? mediaItems.filter(hasBackupSourceMetadata).length +
      entries.projectSourceMetadataCount +
      entries.workspaceSourceMetadataCount
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
      mediaAssetCount: mediaItems.length,
      recordingCount,
      scenarioProjectCount: entries.scenarioProjectCount,
      sourceMetadataCount,
      telemetryCount,
      thumbnailCount: thumbnails.length,
      videoProjectCount: entries.videoProjectCount,
      webSnapshotCount: mediaItems.filter((entry) => entry.source.kind === 'web-snapshot').length,
    }),
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
  await recoverAssetPublications();
  const options = createMediaHubBackupExportOptions(rawOptions);
  return buildLocalBackupSummary(await loadLocalBackupInspectionEntries(options), options);
}
