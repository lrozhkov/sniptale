import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildEffects: vi.fn(),
  buildMedia: vi.fn(),
  buildScenarios: vi.fn(),
  buildVideoProjects: vi.fn(),
  db: { getAll: vi.fn() },
}));

vi.mock('../../../../composition/persistence/infrastructure/indexed-db/core', async (original) => ({
  ...(await original<
    typeof import('../../../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  initDB: vi.fn(async () => mocks.db),
}));
vi.mock('./effect-bundles', () => ({ buildEffectBundleRootInventory: mocks.buildEffects }));
vi.mock('./media', () => ({ buildMediaRootInventory: mocks.buildMedia }));
vi.mock('./scenario-projects', () => ({
  buildScenarioProjectRootInventory: mocks.buildScenarios,
}));
vi.mock('./video-projects', () => ({
  buildVideoProjectRootInventory: mocks.buildVideoProjects,
}));

import {
  SCENARIO_ASSETS_STORE,
  SCENARIO_PROJECTS_STORE,
  VIDEO_PROJECTS_STORE,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import {
  createVideoProjectEntry,
  createVideoProjectEntryWithMediaClip,
} from '../../../../composition/persistence/projects/index.test-support';
import { createGuideProject } from '../../../../features/scenario/project/public';
import { createMediaHubBackupExportOptions } from '../options';
import { buildMediaHubBackupExportPlanFromLibraryV6 } from './index';

function options() {
  return createMediaHubBackupExportOptions({
    includeDrafts: false,
    scope: 'selected',
    selected: {
      mediaAssetIds: [],
      scenarioProjectIds: [],
      videoProjectIds: ['project-1'],
    },
  });
}

function scenarioRoot(id: string) {
  return {
    descriptor: {
      metadataPath: `_sniptale/metadata/scenario-projects/${id}.json`,
      objectCount: 0,
      rootId: id,
      rootKind: 'scenario-project' as const,
      totalBytes: 0,
    },
    load: vi.fn(),
    summary: {
      draftCount: 0,
      recordingCount: 0,
      sourceMetadataCount: 0,
      telemetryCount: 0,
      thumbnailCount: 0,
      webSnapshotCount: 0,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.buildEffects.mockResolvedValue([]);
  mocks.buildMedia.mockResolvedValue([]);
  mocks.buildScenarios.mockResolvedValue([]);
  mocks.buildVideoProjects.mockResolvedValue([]);
});

it('includes the scenario root that owns selected video source dependencies', async () => {
  const video = createVideoProjectEntryWithMediaClip();
  video.id = 'project-1';
  video.project.id = 'project-1';
  video.project.source = { kind: 'scenario', scenarioProjectId: 'scenario-1' };
  video.project.assets[0]!.source = {
    kind: 'scenario-asset',
    scenarioAssetId: 'scenario-image',
  };
  const scenario = {
    createdAt: 1,
    id: 'scenario-1',
    project: createGuideProject('Scenario', 'scenario-1', 1),
    updatedAt: 1,
    workspaceRevision: 1,
  };
  const scenarioAsset = {
    assetId: 'physical-image',
    createdAt: 1,
    galleryAssetId: null,
    height: 100,
    id: 'scenario-image',
    mimeType: 'image/png',
    projectId: 'scenario-1',
    size: 4,
    width: 100,
  };
  mocks.db.getAll.mockImplementation(async (store: string) => {
    if (store === VIDEO_PROJECTS_STORE) return [video];
    if (store === SCENARIO_PROJECTS_STORE) return [scenario];
    if (store === SCENARIO_ASSETS_STORE) return [scenarioAsset];
    return [];
  });
  mocks.buildScenarios.mockResolvedValue([scenarioRoot('scenario-1')]);

  await buildMediaHubBackupExportPlanFromLibraryV6(options());

  expect(mocks.buildScenarios).toHaveBeenCalledWith(
    expect.objectContaining({
      options: expect.objectContaining({
        selected: expect.objectContaining({ scenarioProjectIds: ['scenario-1'] }),
      }),
    })
  );
});

it('fails when an admitted video depends on an excluded draft scenario', async () => {
  const video = createVideoProjectEntry({
    source: { kind: 'scenario', scenarioProjectId: 'scenario-draft' },
  });
  const scenario = {
    createdAt: 1,
    id: 'scenario-draft',
    lifecycle: { savedAt: null, storageClass: 'temporary' as const, updatedAt: 1 },
    project: createGuideProject('Draft', 'scenario-draft', 1),
    updatedAt: 1,
    workspaceRevision: 1,
  };
  mocks.db.getAll.mockImplementation(async (store: string) => {
    if (store === VIDEO_PROJECTS_STORE) return [video];
    if (store === SCENARIO_PROJECTS_STORE) return [scenario];
    return [];
  });

  await expect(buildMediaHubBackupExportPlanFromLibraryV6(options())).rejects.toThrow(
    'requires an excluded scenario project: scenario-draft'
  );
});

it('fails when an admitted video references a missing scenario child', async () => {
  const video = createVideoProjectEntryWithMediaClip();
  video.id = 'project-1';
  video.project.id = 'project-1';
  video.project.assets[0]!.source = {
    kind: 'scenario-asset',
    scenarioAssetId: 'missing-image',
  };
  mocks.db.getAll.mockImplementation(async (store: string) =>
    store === VIDEO_PROJECTS_STORE ? [video] : []
  );

  await expect(buildMediaHubBackupExportPlanFromLibraryV6(options())).rejects.toThrow(
    'requires a missing scenario asset: missing-image'
  );
});
