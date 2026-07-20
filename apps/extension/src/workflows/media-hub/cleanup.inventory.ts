import type { EditorSessionEntry } from '../../composition/persistence/editor-sessions/contracts';
import type {
  MediaLibraryItem,
  MediaThumbnailEntry,
} from '../../composition/persistence/media-library/contracts';
import type {
  PendingScenarioAssetEntry,
  ScenarioAssetEntry,
  ScenarioExportEntry,
  ScenarioProjectEntry,
  ScenarioStepEditorDocumentEntry,
} from '../../composition/persistence/scenario/contracts';
import type { VideoProjectEntry } from '../../composition/persistence/projects/contracts';
import type { WebSnapshotRecord } from '../../composition/persistence/web-snapshots/contracts';
import type { StorageCleanupCandidate } from '../../features/media-hub/types';

const STALE_EDITOR_DRAFT_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const OLD_DIAGNOSTICS_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_PENDING_SCENARIO_ASSET_AGE_MS = 24 * 60 * 60 * 1000;

export interface StorageCleanupInventory {
  diagnostics: Array<{ createdAt: string; recordingId: string; totalEvents?: number }>;
  editorSessions: EditorSessionEntry[];
  pendingScenarioAssets: PendingScenarioAssetEntry[];
  scenarioAssets: ScenarioAssetEntry[];
  scenarioExports: ScenarioExportEntry[];
  scenarioProjects: ScenarioProjectEntry[];
  scenarioStepDocuments: ScenarioStepEditorDocumentEntry[];
  thumbnails: MediaThumbnailEntry[];
  videoProjects: VideoProjectEntry[];
  webSnapshots?: WebSnapshotRecord[];
}

export function buildInventoryCleanupCandidates(args: {
  mediaItems: MediaLibraryItem[];
  rawInventory: StorageCleanupInventory | undefined;
}): {
  oldDiagnostics: StorageCleanupCandidate[];
  orphanedScenarioArtifacts: StorageCleanupCandidate[];
  orphanedScenarioPendingAssets: StorageCleanupCandidate[];
  orphanedThumbnails: StorageCleanupCandidate[];
  staleEditorDrafts: StorageCleanupCandidate[];
} {
  return {
    oldDiagnostics: getOldDiagnostics(args.rawInventory),
    orphanedScenarioArtifacts: getOrphanedScenarioArtifacts(args.rawInventory),
    orphanedScenarioPendingAssets: getOrphanedScenarioPendingAssets(args.rawInventory),
    orphanedThumbnails: getOrphanedThumbnails(args),
    staleEditorDrafts: getStaleEditorDrafts(args.rawInventory),
  };
}

function getOrphanedScenarioArtifacts(
  inventory: StorageCleanupInventory | undefined
): StorageCleanupCandidate[] {
  if (!inventory) {
    return [];
  }

  const projectIds = new Set(inventory.scenarioProjects.map((entry) => entry.id));
  const assetCandidates = inventory.scenarioAssets
    .filter((entry) => !projectIds.has(entry.projectId))
    .map((entry) => createScenarioArtifactCandidate(entry, 'scenario-asset'));
  const exportCandidates = inventory.scenarioExports
    .filter((entry) => !projectIds.has(entry.projectId))
    .map((entry) => createScenarioArtifactCandidate(entry, 'scenario-export'));
  const documentCandidates = inventory.scenarioStepDocuments
    .filter((entry) => !projectIds.has(entry.projectId))
    .map((entry) => createScenarioArtifactCandidate(entry, 'scenario-step-document'));

  return [...assetCandidates, ...exportCandidates, ...documentCandidates].sort(
    (left, right) => right.createdAt - left.createdAt
  );
}

function getOrphanedScenarioPendingAssets(
  inventory: StorageCleanupInventory | undefined
): StorageCleanupCandidate[] {
  if (!inventory) {
    return [];
  }

  const cutoff = Date.now() - STALE_PENDING_SCENARIO_ASSET_AGE_MS;
  return inventory.pendingScenarioAssets
    .filter((entry) => entry.createdAt < cutoff)
    .sort((left, right) => left.createdAt - right.createdAt)
    .map((entry) => ({
      id: entry.id,
      filename: entry.id,
      size: entry.size,
      createdAt: entry.createdAt,
      kind: 'scenario-asset',
      target: 'scenario-pending-asset',
    }));
}

function getOrphanedThumbnails(args: {
  mediaItems: MediaLibraryItem[];
  rawInventory: StorageCleanupInventory | undefined;
}): StorageCleanupCandidate[] {
  if (!args.rawInventory) {
    return [];
  }

  const expectedIds = new Set(args.mediaItems.map((item) => item.id));
  for (const entry of args.rawInventory.scenarioProjects) {
    expectedIds.add(`scenario:${entry.id}`);
  }
  for (const entry of args.rawInventory.scenarioExports) {
    expectedIds.add(`scenario-export:${entry.id}`);
  }
  for (const entry of args.rawInventory.videoProjects) {
    expectedIds.add(`video-project:${entry.id}`);
  }

  return args.rawInventory.thumbnails
    .filter((entry) => !expectedIds.has(entry.assetId))
    .map((entry) => ({
      id: entry.assetId,
      filename: entry.assetId,
      size: entry.blob.size,
      createdAt: entry.createdAt,
      kind: 'thumbnail',
      target: 'thumbnail',
    }));
}

function getOldDiagnostics(
  inventory: StorageCleanupInventory | undefined
): StorageCleanupCandidate[] {
  if (!inventory) {
    return [];
  }

  const cutoff = Date.now() - OLD_DIAGNOSTICS_AGE_MS;
  return inventory.diagnostics
    .filter((entry) => Date.parse(entry.createdAt) < cutoff)
    .map((entry) => ({
      id: entry.recordingId,
      filename: entry.recordingId,
      size: entry.totalEvents ?? 0,
      createdAt: Date.parse(entry.createdAt) || 0,
      kind: 'diagnostics',
      target: 'diagnostics',
    }));
}

function getStaleEditorDrafts(
  inventory: StorageCleanupInventory | undefined
): StorageCleanupCandidate[] {
  if (!inventory) {
    return [];
  }

  const cutoff = Date.now() - STALE_EDITOR_DRAFT_AGE_MS;
  return inventory.editorSessions
    .filter((entry) => entry.updatedAt < cutoff)
    .map((entry) => ({
      id: entry.sessionId,
      filename: entry.sourceTitle ?? entry.sessionId,
      size: 0,
      createdAt: entry.updatedAt,
      kind: 'editor-session',
      target: 'editor-session',
    }));
}

function createScenarioArtifactCandidate(
  entry: ScenarioAssetEntry | ScenarioExportEntry | ScenarioStepEditorDocumentEntry,
  target: 'scenario-asset' | 'scenario-export' | 'scenario-step-document'
): StorageCleanupCandidate {
  const id = 'id' in entry ? entry.id : entry.stepId;
  const filename = 'filename' in entry ? entry.filename : id;
  return {
    id,
    filename,
    size: 'size' in entry ? entry.size : 0,
    createdAt: entry.createdAt,
    kind: target,
    target,
  };
}
