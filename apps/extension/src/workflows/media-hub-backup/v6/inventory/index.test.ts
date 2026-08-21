import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  MEDIA_LIBRARY_STORE,
  SCENARIO_ASSETS_STORE,
  SCENARIO_PROJECTS_STORE,
  VIDEO_EFFECT_BUNDLES_STORE,
  VIDEO_PROJECTS_STORE,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import { createVideoProjectEntry } from '../../../../composition/persistence/projects/index.test-support';
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.buildEffects.mockResolvedValue([]);
  mocks.buildMedia.mockResolvedValue([]);
  mocks.buildScenarios.mockResolvedValue([]);
  mocks.buildVideoProjects.mockResolvedValue([]);
});

describe('media backup v6 dependency admission', () => {
  it('does not export dependencies of a selected draft project after draft opt-out', async () => {
    const project = createVideoProjectEntry(
      { baseRecordingId: 'recording-1' },
      { lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 1 } }
    );
    mocks.db.getAll.mockImplementation(async (store: string) => {
      if (store === VIDEO_PROJECTS_STORE) return [project];
      if (
        store === MEDIA_LIBRARY_STORE ||
        store === SCENARIO_ASSETS_STORE ||
        store === SCENARIO_PROJECTS_STORE ||
        store === VIDEO_EFFECT_BUNDLES_STORE
      )
        return [];
      return [];
    });

    await buildMediaHubBackupExportPlanFromLibraryV6(options());

    expect(mocks.buildMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          includeDrafts: false,
          selected: expect.objectContaining({ mediaAssetIds: [] }),
        }),
      })
    );
  });

  it('fails rather than silently exporting an excluded draft dependency of an admitted project', async () => {
    const project = createVideoProjectEntry({ baseRecordingId: 'recording-1' });
    mocks.db.getAll.mockImplementation(async (store: string) =>
      store === VIDEO_PROJECTS_STORE ? [project] : []
    );
    await expect(buildMediaHubBackupExportPlanFromLibraryV6(options())).rejects.toThrow(
      'requires an excluded draft media item'
    );
  });
});
