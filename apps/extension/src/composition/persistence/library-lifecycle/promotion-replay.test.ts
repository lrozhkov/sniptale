import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMediaLibraryEntry,
  createVideoProjectEntry,
  createVideoProjectEntryWithMediaClip,
} from '../projects/index.test-support';
import { createScenarioProject } from '../../../features/scenario/project/factories/project';
import { createScenarioCaptureStep } from '../../../features/scenario/project/public';

const persistenceMocks = vi.hoisted(() => ({
  runWithIndexedDbMutation: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: persistenceMocks.runWithIndexedDbMutation,
}));

import { createLibraryLifecycle, promoteStoredItem } from '.';

beforeEach(() => {
  vi.clearAllMocks();
});

function installTransaction(stores: Record<string, object>): void {
  persistenceMocks.runWithIndexedDbMutation.mockImplementationOnce(async (effect) =>
    effect({
      transaction: vi.fn(() => ({
        done: Promise.resolve(),
        objectStore: vi.fn((name: string) => stores[name]),
      })),
    })
  );
}

function presentation(args: {
  id: string;
  kind: 'image' | 'scenario' | 'video-project';
  revision: number;
}) {
  return {
    aggregateId: args.id,
    aggregateKind: args.kind,
    presentationRevision: args.revision,
    thumbnailBlob: new Blob(['preview']),
    updatedAt: 10,
  };
}

describe('aggregate lifecycle promotion replay', () => {
  it('promotes a scenario only when its presentation matches the root revision', async () => {
    const scenario = createScenarioProject('Scenario');
    const root = {
      createdAt: 10,
      id: scenario.id,
      lifecycle: createLibraryLifecycle('temporary', 10),
      project: scenario,
      updatedAt: 10,
      workspaceRevision: 4,
    };
    const put = vi.fn();
    installTransaction({
      aggregate_presentations: {
        get: vi.fn(async () => presentation({ id: root.id, kind: 'scenario', revision: 4 })),
      },
      scenario_assets: { get: vi.fn() },
      scenario_projects: { get: vi.fn(async () => root), put },
    });

    await promoteStoredItem({ id: root.id, kind: 'scenario-project' });
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({ lifecycle: expect.objectContaining({ storageClass: 'library' }) })
    );

    installTransaction({
      aggregate_presentations: {
        get: vi.fn(async () => presentation({ id: root.id, kind: 'scenario', revision: 3 })),
      },
      scenario_assets: { get: vi.fn() },
      scenario_projects: { get: vi.fn(async () => root), put },
    });
    await expect(promoteStoredItem({ id: root.id, kind: 'scenario-project' })).rejects.toThrow(
      'presentation is stale'
    );
  });

  it('rejects scenario promotion when a referenced capture asset is unavailable', async () => {
    const scenario = createScenarioProject('Scenario');
    scenario.steps = [createScenarioCaptureStep({ assetId: 'asset-missing' })];
    const root = {
      createdAt: 10,
      id: scenario.id,
      lifecycle: createLibraryLifecycle('temporary', 10),
      project: scenario,
      updatedAt: 10,
      workspaceRevision: 1,
    };
    const put = vi.fn();
    installTransaction({
      aggregate_presentations: {
        get: vi.fn(async () => presentation({ id: root.id, kind: 'scenario', revision: 1 })),
      },
      scenario_assets: { get: vi.fn(async () => undefined) },
      scenario_projects: { get: vi.fn(async () => root), put },
    });

    await expect(promoteStoredItem({ id: root.id, kind: 'scenario-project' })).rejects.toThrow(
      'Linked scenario asset asset-missing was not found'
    );
    expect(put).not.toHaveBeenCalled();
  });

  it('treats a legacy or already-library project as an idempotent saved aggregate', async () => {
    const library = createVideoProjectEntry({ id: 'library-project' }, { id: 'library-project' });
    const put = vi.fn();
    installTransaction({
      aggregate_presentations: { get: vi.fn() },
      media_library: { getAll: vi.fn(), put: vi.fn() },
      project_assets: { get: vi.fn() },
      recordings: { get: vi.fn(), put: vi.fn() },
      video_projects: { get: vi.fn(async () => library), put },
    });

    await expect(
      promoteStoredItem({ id: library.id, kind: 'video-project' })
    ).resolves.toBeUndefined();
    expect(put).not.toHaveBeenCalled();
  });

  it('promotes a video graph while preserving independently saved child lifecycles', async () => {
    const base = createVideoProjectEntryWithMediaClip();
    const project = {
      ...base,
      lifecycle: createLibraryLifecycle('temporary', 10),
      project: {
        ...base.project,
        baseRecordingId: 'recording-1',
        source: { kind: 'recording' as const, recordingId: 'recording-1' },
      },
      workspaceRevision: 2,
    };
    const recordingLifecycle = createLibraryLifecycle('library', 700);
    const assetLifecycle = createLibraryLifecycle('library', 800);
    const recording = {
      assetId: 'asset-recording-1',
      createdAt: 10,
      filename: 'recording.webm',
      id: 'recording-1',
      lifecycle: recordingLifecycle,
      mimeType: 'video/webm',
      size: 9,
    };
    const mediaRows = [
      createMediaLibraryEntry({
        id: 'recording:recording-1',
        lifecycle: recordingLifecycle,
        source: { kind: 'recording', recordingId: 'recording-1' },
      }),
      createMediaLibraryEntry({
        id: 'project-asset:project-asset-1',
        lifecycle: assetLifecycle,
        source: { kind: 'project-asset', projectAssetId: 'project-asset-1' },
      }),
    ];
    const projectPut = vi.fn();
    const recordingPut = vi.fn();
    const mediaPut = vi.fn();
    vi.spyOn(Date, 'now').mockReturnValue(999);
    installTransaction({
      aggregate_presentations: {
        get: vi.fn(async () =>
          presentation({ id: project.id, kind: 'video-project', revision: 2 })
        ),
      },
      media_library: { getAll: vi.fn(async () => mediaRows), put: mediaPut },
      project_assets: {
        get: vi.fn(async () => ({
          blob: new Blob(['asset']),
          createdAt: 10,
          id: 'project-asset-1',
          mimeType: 'image/png',
          size: 5,
        })),
      },
      recordings: { get: vi.fn(async () => recording), put: recordingPut },
      video_projects: { get: vi.fn(async () => project), put: projectPut },
    });

    await promoteStoredItem({ id: project.id, kind: 'video-project' });

    expect(recordingPut).toHaveBeenCalledWith(
      expect.objectContaining({ lifecycle: recordingLifecycle })
    );
    expect(mediaPut).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ lifecycle: recordingLifecycle })
    );
    expect(mediaPut).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ lifecycle: assetLifecycle })
    );
    expect(projectPut).toHaveBeenCalledWith(
      expect.objectContaining({
        lifecycle: { savedAt: 999, storageClass: 'library', updatedAt: 999 },
      })
    );
  });

  it('requires an image presentation at the same revision and keeps the aggregate id', async () => {
    const media = {
      ...createMediaLibraryEntry({
        id: 'image-1',
        lifecycle: createLibraryLifecycle('temporary', 10),
        source: { kind: 'screenshot' },
      }),
      workspaceRevision: 5,
    };
    const put = vi.fn();
    installTransaction({
      aggregate_presentations: {
        get: vi.fn(async () => presentation({ id: media.id, kind: 'image', revision: 5 })),
      },
      image_workspaces: { get: vi.fn(async () => undefined) },
      media_library: { get: vi.fn(async () => media), put },
      project_assets: { get: vi.fn() },
      recordings: { get: vi.fn(), put: vi.fn() },
    });

    await promoteStoredItem({ id: media.id, kind: 'media' });
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({
        id: media.id,
        lifecycle: expect.objectContaining({ storageClass: 'library' }),
      })
    );

    installTransaction({
      aggregate_presentations: {
        get: vi.fn(async () => presentation({ id: media.id, kind: 'image', revision: 4 })),
      },
      image_workspaces: { get: vi.fn(async () => undefined) },
      media_library: { get: vi.fn(async () => media), put },
      project_assets: { get: vi.fn() },
      recordings: { get: vi.fn(), put: vi.fn() },
    });
    await expect(promoteStoredItem({ id: media.id, kind: 'media' })).rejects.toThrow(
      'presentation is stale'
    );
  });

  it('fails closed when an aggregate root is absent', async () => {
    installTransaction({
      aggregate_presentations: { get: vi.fn() },
      scenario_projects: { get: vi.fn(async () => undefined), put: vi.fn() },
    });
    await expect(promoteStoredItem({ id: 'missing', kind: 'scenario-project' })).rejects.toThrow(
      'was not found'
    );
  });
});
