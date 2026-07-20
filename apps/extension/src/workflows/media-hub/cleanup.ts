import {
  collectReferencedProjectAssetIds,
  collectReferencedRecordingIds,
} from '../../features/media-hub/references';
import type { MediaLibraryItem } from '../../composition/persistence/media-library/contracts';
import type {
  ProjectAssetEntry,
  ProjectExportEntry,
} from '../../composition/persistence/projects/contracts';
import type { RecordingEntry } from '../../composition/persistence/recordings/contracts';
import type { VideoProject } from '../../features/video/project/types/model';

import {
  buildInventoryCleanupCandidates,
  type StorageCleanupInventory,
} from './cleanup.inventory.ts';
import type { StorageCleanupCandidate } from '../../features/media-hub/types';

const OLD_SCREENSHOT_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface StorageCleanupCandidateGroups {
  brokenMediaMirrors: StorageCleanupCandidate[];
  orphanedRawRecordings: StorageCleanupCandidate[];
  orphanedProjectAssets: StorageCleanupCandidate[];
  orphanedScenarioArtifacts: StorageCleanupCandidate[];
  orphanedScenarioPendingAssets: StorageCleanupCandidate[];
  orphanedThumbnails: StorageCleanupCandidate[];
  heavyFiles: StorageCleanupCandidate[];
  oldScreenshots: StorageCleanupCandidate[];
  oldDiagnostics: StorageCleanupCandidate[];
  staleEditorDrafts: StorageCleanupCandidate[];
}

export function sumBytes(items: Array<{ size: number }>): number {
  return items.reduce((total, item) => total + item.size, 0);
}

export function buildCleanupCandidates(params: {
  mediaItems: MediaLibraryItem[];
  projectAssets?: Array<Omit<ProjectAssetEntry, 'blob'> & { filename: string }>;
  recordings: Array<Omit<RecordingEntry, 'blob'>>;
  projectExports: ProjectExportEntry[];
  projectDetails: Array<VideoProject | null>;
  rawInventory?: StorageCleanupInventory;
  topN?: number;
}): StorageCleanupCandidateGroups {
  const {
    mediaItems,
    recordings,
    projectAssets = [],
    projectExports,
    projectDetails,
    topN = 10,
  } = params;
  const references = collectCleanupReferences({ mediaItems, projectDetails, projectExports });
  const inventoryCandidates = buildInventoryCleanupCandidates({
    mediaItems,
    rawInventory: params.rawInventory,
  });

  return {
    brokenMediaMirrors: getBrokenMediaMirrors({
      mediaItems,
      projectAssets,
      projectExports,
      recordings,
      webSnapshotIds: new Set(params.rawInventory?.webSnapshots?.map((entry) => entry.id) ?? []),
    }),
    orphanedRawRecordings: getOrphanedRawRecordings(recordings, references.recordingIds),
    orphanedProjectAssets: getOrphanedProjectAssets(projectAssets, references.projectAssetIds),
    orphanedScenarioArtifacts: inventoryCandidates.orphanedScenarioArtifacts,
    orphanedScenarioPendingAssets: inventoryCandidates.orphanedScenarioPendingAssets,
    orphanedThumbnails: inventoryCandidates.orphanedThumbnails,
    heavyFiles: getHeavyFiles(mediaItems, topN),
    oldScreenshots: getOldScreenshots(mediaItems),
    oldDiagnostics: inventoryCandidates.oldDiagnostics,
    staleEditorDrafts: inventoryCandidates.staleEditorDrafts,
  };
}

function collectCleanupReferences(args: {
  mediaItems: MediaLibraryItem[];
  projectDetails: Array<VideoProject | null>;
  projectExports: ProjectExportEntry[];
}): {
  projectAssetIds: Set<string>;
  recordingIds: Set<string>;
} {
  return {
    projectAssetIds: collectReferencedProjectAssetIds(args.projectDetails),
    recordingIds: collectReferencedRecordingIds({
      mediaEntries: args.mediaItems,
      projectExports: args.projectExports,
      projects: args.projectDetails,
    }),
  };
}

function getOrphanedRawRecordings(
  recordings: Array<Omit<RecordingEntry, 'blob'>>,
  referencedRecordingIds: Set<string>
): StorageCleanupCandidate[] {
  return recordings
    .filter((recording) => !referencedRecordingIds.has(recording.id))
    .sort((left, right) => right.createdAt - left.createdAt)
    .map((recording) => createRecordingCandidate(recording));
}

function getHeavyFiles(mediaItems: MediaLibraryItem[], topN: number): StorageCleanupCandidate[] {
  return [...mediaItems]
    .sort((left, right) => right.size - left.size)
    .slice(0, topN)
    .map((item) => createAssetCandidate(item));
}

function getOldScreenshots(mediaItems: MediaLibraryItem[]): StorageCleanupCandidate[] {
  const cutoffTimestamp = Date.now() - OLD_SCREENSHOT_AGE_MS;

  return mediaItems
    .filter((item) => item.kind === 'screenshot' && item.createdAt < cutoffTimestamp)
    .sort((left, right) => left.createdAt - right.createdAt)
    .map((item) => createAssetCandidate(item));
}

function getBrokenMediaMirrors(args: {
  mediaItems: MediaLibraryItem[];
  projectAssets: Array<Omit<ProjectAssetEntry, 'blob'> & { filename: string }>;
  projectExports: ProjectExportEntry[];
  recordings: Array<Omit<RecordingEntry, 'blob'>>;
  webSnapshotIds?: Set<string>;
}): StorageCleanupCandidate[] {
  const recordingIds = new Set(args.recordings.map((entry) => entry.id));
  const projectExportIds = new Set(args.projectExports.map((entry) => entry.id));
  const projectAssetIds = new Set(args.projectAssets.map((entry) => entry.id));
  const webSnapshotIds = args.webSnapshotIds ?? new Set<string>();

  return args.mediaItems
    .filter((item) => {
      if (item.source.kind === 'screenshot') {
        return false;
      }
      if (item.source.kind === 'recording') {
        return !recordingIds.has(item.source.recordingId);
      }
      if (item.source.kind === 'project-export') {
        return (
          !recordingIds.has(item.source.recordingId) || !projectExportIds.has(item.source.exportId)
        );
      }
      if (item.source.kind === 'web-snapshot') {
        return !webSnapshotIds.has(item.source.snapshotId);
      }
      return !projectAssetIds.has(item.source.projectAssetId);
    })
    .map((item) => createAssetCandidate(item));
}

function getOrphanedProjectAssets(
  projectAssets: Array<Omit<ProjectAssetEntry, 'blob'> & { filename: string }>,
  referencedProjectAssetIds: Set<string>
): StorageCleanupCandidate[] {
  return projectAssets
    .filter((asset) => !referencedProjectAssetIds.has(asset.id))
    .sort((left, right) => right.createdAt - left.createdAt)
    .map((asset) => ({
      id: asset.id,
      filename: asset.filename,
      size: asset.size,
      createdAt: asset.createdAt,
      kind: asset.mimeType.startsWith('video/')
        ? 'video'
        : asset.mimeType.startsWith('audio/')
          ? 'audio'
          : 'image',
      target: 'project-asset',
    }));
}

function createRecordingCandidate(
  recording: Omit<RecordingEntry, 'blob'>
): StorageCleanupCandidate {
  return {
    id: recording.id,
    filename: recording.filename,
    size: recording.size,
    createdAt: recording.createdAt,
    kind: 'recording',
    target: 'recording',
  };
}

function createAssetCandidate(item: MediaLibraryItem): StorageCleanupCandidate {
  return {
    id: item.id,
    filename: item.filename,
    size: item.size,
    createdAt: item.createdAt,
    kind: item.kind,
    target: 'asset',
  };
}
