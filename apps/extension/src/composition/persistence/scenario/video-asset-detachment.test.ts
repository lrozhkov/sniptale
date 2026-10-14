import { createCameraFollowSettings } from '../../../features/video/project/camera/cursor-policy';
import { expect, it, vi } from 'vitest';
import {
  createVideoProjectEntryWithMediaClip,
  createVideoProjectRestoreTransaction,
} from '../projects/index.test-support';
import { detachScenarioVideoAssets } from './video-asset-detachment';

it.each([3, 4] as const)(
  'keeps unrelated v%s projects while detaching the scenario origin',
  async (version) => {
    const unrelated = createVideoProjectEntryWithMediaClip({
      version,
      actionFeedback: [],
      ...(version === 4 ? { cameraFollowDefaults: createCameraFollowSettings() } : {}),
    });
    const related = {
      ...unrelated,
      id: 'related',
      project: {
        ...unrelated.project,
        id: 'related',
        source: { kind: 'scenario' as const, scenarioProjectId: 'deleted' },
      },
    };
    const empty = {
      get: vi.fn(async () => undefined),
      getAll: vi.fn(async () => []),
      put: vi.fn(),
      delete: vi.fn(),
      index: vi.fn(() => ({
        getAll: vi.fn(async () => []),
        getAllKeys: vi.fn(async () => []),
        count: vi.fn(async () => 0),
      })),
    };
    const projects = { ...empty, getAll: vi.fn(async () => [unrelated, related]), put: vi.fn() };
    const tx = createVideoProjectRestoreTransaction({
      assets: empty,
      exports: empty,
      media: empty,
      videoWorkspaces: empty,
      videoDrafts: empty,
      operations: empty,
      owners: empty,
      presentations: empty,
      projects,
      refs: empty,
      thumbnails: empty,
      scenarioAssets: empty,
    });
    await detachScenarioVideoAssets(tx, 'deleted', new Set());
    expect(projects.put).toHaveBeenCalledOnce();
    expect(projects.put.mock.calls[0]?.[0]).toMatchObject({
      id: 'related',
      project: {
        version,
        source: { kind: 'manual' },
        actionFeedback: [],
        ...(version === 4 ? { cameraFollowDefaults: unrelated.project.cameraFollowDefaults } : {}),
      },
    });
    expect(unrelated.project.source.kind).toBe('manual');
  }
);
