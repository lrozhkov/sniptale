import { createMediaHubBackupDataClassFlags } from './options';
import { countScenarioProjectSourceMetadata, hasBackupSourceMetadata } from './privacy';
import { BACKUP_FORMAT, BACKUP_VERSION } from '../manifest';
import type {
  MediaHubBackupAssetDescriptor,
  EffectBundleBackupDescriptor,
  MediaHubBackupExportOptions,
  MediaHubBackupManifest,
  ScenarioBackupProjectDescriptor,
  VideoBackupProjectDescriptor,
} from '../contracts/types';

export interface BackupProjectDescriptorSet {
  effectBundles: EffectBundleBackupDescriptor[];
  scenarioProjects: ScenarioBackupProjectDescriptor[];
  videoProjects: VideoBackupProjectDescriptor[];
}

interface BackupManifestContentCounts {
  editorDraftCount: number;
  mediaAssetCount: number;
  recordingCount: number;
  scenarioProjectCount: number;
  sourceMetadataCount: number;
  telemetryCount: number;
  thumbnailCount: number;
  videoProjectCount: number;
  webSnapshotCount: number;
}

export function buildBackupManifest(args: {
  assets: MediaHubBackupAssetDescriptor[];
  options: MediaHubBackupExportOptions;
  projects: BackupProjectDescriptorSet;
  thumbnailCount: number;
}): MediaHubBackupManifest {
  const { assets, options, projects, thumbnailCount } = args;
  const { scenarioProjects, videoProjects } = projects;
  const counts = createBackupManifestContentCounts({
    assets,
    projects,
    thumbnailCount,
  });

  return {
    assetCount: assets.length,
    dataClasses: createMediaHubBackupDataClassFlags(options, counts),
    effectBundleCount: projects.effectBundles.length,
    exportedAt: new Date().toISOString(),
    format: BACKUP_FORMAT,
    privacyOptions: options,
    scenarioProjectCount: scenarioProjects.length,
    thumbnailCount,
    videoProjectCount: videoProjects.length,
    version: BACKUP_VERSION,
  };
}

function createBackupManifestContentCounts(args: {
  assets: MediaHubBackupAssetDescriptor[];
  projects: BackupProjectDescriptorSet;
  thumbnailCount: number;
}): BackupManifestContentCounts {
  const { assets, projects, thumbnailCount } = args;
  const { scenarioProjects, videoProjects } = projects;
  return {
    editorDraftCount: scenarioProjects.reduce(
      (count, project) => count + project.stepDocuments.length,
      0
    ),
    mediaAssetCount: assets.length,
    recordingCount: countBackupRecordings(assets, videoProjects),
    scenarioProjectCount: scenarioProjects.length,
    sourceMetadataCount: countBackupSourceMetadata(assets, scenarioProjects),
    telemetryCount: countBackupTelemetry(assets, videoProjects),
    thumbnailCount: thumbnailCount + countProjectThumbnails(projects),
    videoProjectCount: videoProjects.length,
    webSnapshotCount: assets.filter((asset) => asset.entry.source.kind === 'web-snapshot').length,
  };
}

function countProjectThumbnails({
  scenarioProjects,
  videoProjects,
}: BackupProjectDescriptorSet): number {
  const videoProjectThumbnails = videoProjects.filter((project) => project.thumbnail).length;
  const videoExportThumbnails = videoProjects.reduce(
    (count, project) =>
      count + project.projectExports.filter((projectExport) => projectExport.thumbnail).length,
    0
  );
  const scenarioProjectThumbnails = scenarioProjects.filter((project) => project.thumbnail).length;
  const scenarioExportThumbnails = scenarioProjects.reduce(
    (count, project) => count + (project.exportThumbnails?.length ?? 0),
    0
  );

  return (
    videoProjectThumbnails +
    videoExportThumbnails +
    scenarioProjectThumbnails +
    scenarioExportThumbnails
  );
}

function countBackupRecordings(
  assets: MediaHubBackupAssetDescriptor[],
  videoProjects: VideoBackupProjectDescriptor[]
): number {
  return (
    assets.filter(
      (asset) =>
        asset.entry.source.kind === 'recording' || asset.entry.source.kind === 'project-export'
    ).length + videoProjects.reduce((count, project) => count + project.projectExports.length, 0)
  );
}

function countBackupSourceMetadata(
  assets: MediaHubBackupAssetDescriptor[],
  scenarioProjects: ScenarioBackupProjectDescriptor[]
): number {
  return (
    assets.filter((asset) => hasBackupSourceMetadata(asset.entry)).length +
    scenarioProjects.reduce(
      (count, project) => count + countScenarioProjectSourceMetadata(project),
      0
    )
  );
}

function countBackupTelemetry(
  assets: MediaHubBackupAssetDescriptor[],
  videoProjects: VideoBackupProjectDescriptor[]
): number {
  return (
    assets.filter((asset) => asset.recordingTelemetry).length +
    videoProjects.reduce(
      (count, project) =>
        count +
        project.projectExports.filter((projectExport) => projectExport.recordingTelemetry).length,
      0
    )
  );
}
