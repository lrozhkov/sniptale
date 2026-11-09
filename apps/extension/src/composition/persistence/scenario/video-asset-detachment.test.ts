import { readScenarioVideoDependencyRows } from '../media-library/deletion-index';
import { projectRowReferenceKeys } from '../assets/retention-index-projection';
import { ROW_REFERENCE_INDEX } from '../infrastructure/indexed-db/row-index-contract';
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
    const projects = {
      ...empty,
      getAll: vi.fn(async () => {
        throw new Error('Global video dependency read');
      }),
      index: vi.fn((name: string) => {
        expect(name).toBe(ROW_REFERENCE_INDEX);
        return {
          getAll: vi.fn(async (key: string) =>
            [{ ...unrelated, project: { ...unrelated.project, name: 123 } }, related].filter(
              (row) => projectRowReferenceKeys('video_projects', row).includes(key)
            )
          ),
        };
      }),
      put: vi.fn(),
    };
    const baseTx = createVideoProjectRestoreTransaction({
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
    const tx = {
      objectStore: (name: string) =>
        name === 'video_projects' ? projects : baseTx.objectStore(name),
    } as typeof baseTx;
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

it('deduplicates overlapping root and child matches and includes unknown dependency envelopes', async () => {
  const video = createVideoProjectEntryWithMediaClip();
  video.project.source = { kind: 'scenario', scenarioProjectId: 'root' };
  video.project.assets[0]!.source = { kind: 'scenario-asset', scenarioAssetId: 'child' };
  const unknown = { id: 'unknown', project: { version: 999 } };
  const queries = vi.fn(async (key: IDBValidKey) =>
    [video, unknown].filter((row) =>
      projectRowReferenceKeys('video_projects', row).includes(String(key))
    )
  );
  const tx = {
    objectStore: () => ({
      get: async () => undefined,
      index: (name: string) => {
        expect(name).toBe(ROW_REFERENCE_INDEX);
        return { getAll: queries };
      },
    }),
  };
  await expect(
    readScenarioVideoDependencyRows(tx, 'root', new Set(['child']), true)
  ).resolves.toEqual([video, unknown]);
  expect(queries).toHaveBeenCalledTimes(3);
});
