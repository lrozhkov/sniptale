import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildInventoryCleanupCandidates,
  type StorageCleanupInventory,
} from './cleanup.inventory.ts';

function createInventory(now: number): StorageCleanupInventory {
  return {
    diagnostics: createDiagnostics(now),
    pendingScenarioAssets: createPendingAssets(now),
    scenarioAssets: [createScenarioAsset()],
    scenarioExports: [createScenarioExport()],
    scenarioProjects: [{ createdAt: 1, id: 'project-1', project: {} as never, updatedAt: 2 }],
    scenarioStepDocuments: [createStepDocument()],
    thumbnails: [createThumbnail('orphan-thumb'), createThumbnail('video-project:video-project-1')],
    videoProjects: [{ createdAt: 1, id: 'video-project-1', project: {} as never, updatedAt: 2 }],
  };
}

function createDiagnostics(now: number) {
  return [
    { createdAt: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString(), recordingId: 'diag-1' },
  ];
}

function createPendingAssets(now: number) {
  return [
    {
      blob: new Blob(['pending']),
      createdAt: now - 2 * 24 * 60 * 60 * 1000,
      galleryAssetId: null,
      id: 'pending-1',
      mimeType: 'image/png',
      size: 7,
      tabId: 1,
    },
  ];
}

function createScenarioAsset() {
  return {
    assetId: 'opfs-scenario-asset-1',
    createdAt: 2,
    galleryAssetId: null,
    height: 1,
    id: 'scenario-asset-1',
    mimeType: 'image/png',
    projectId: 'missing-project',
    size: 3,
    width: 1,
  };
}

function createScenarioExport() {
  return {
    createdAt: 3,
    filename: 'scenario.html',
    format: 'html' as const,
    id: 'scenario-export-1',
    projectId: 'missing-project',
    size: 4,
  };
}

function createStepDocument() {
  return {
    createdAt: 4,
    document: {} as never,
    projectId: 'missing-project',
    stepId: 'step-1',
    updatedAt: 5,
  };
}

function createThumbnail(assetId: string) {
  return {
    assetId,
    blob: new Blob(['thumb']),
    createdAt: 6,
    height: 1,
    updatedAt: 7,
    width: 1,
  };
}

describe('storage cleanup raw inventory candidates', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000_000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports orphaned and stale records from non-media stores without double-counting valid thumbnails', () => {
    const result = buildInventoryCleanupCandidates({
      mediaItems: [],
      rawInventory: createInventory(Date.now()),
    });

    expect(result.orphanedScenarioArtifacts.map((item) => item.target)).toEqual([
      'scenario-step-document',
      'scenario-export',
      'scenario-asset',
    ]);
    expect(result.orphanedScenarioPendingAssets).toEqual([
      expect.objectContaining({ id: 'pending-1', target: 'scenario-pending-asset' }),
    ]);
    expect(result.orphanedThumbnails).toEqual([
      expect.objectContaining({ id: 'orphan-thumb', target: 'thumbnail' }),
    ]);
    expect(result.oldDiagnostics).toEqual([
      expect.objectContaining({ id: 'diag-1', target: 'diagnostics' }),
    ]);
  });

  it('returns empty candidate groups when raw inventory is unavailable', () => {
    expect(
      buildInventoryCleanupCandidates({
        mediaItems: [],
        rawInventory: undefined,
      })
    ).toEqual({
      oldDiagnostics: [],
      orphanedScenarioArtifacts: [],
      orphanedScenarioPendingAssets: [],
      orphanedThumbnails: [],
    });
  });
});
