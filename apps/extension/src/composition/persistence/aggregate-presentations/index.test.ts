import { beforeEach, expect, it, vi } from 'vitest';
import { createVideoProjectEntry } from '../projects/index.test-support';
import { createScenarioProject } from '../../../features/scenario/project/factories/project';

const mocks = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
  getAll: vi.fn(),
  initDB: vi.fn(),
  runWithIndexedDbMutation: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: mocks.initDB,
}));

vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.runWithIndexedDbMutation,
}));

import {
  commitProjectAggregatePresentation,
  deleteAggregatePresentation,
  getAggregatePresentation,
  getAggregatePreviewBlob,
  listAggregatePresentations,
} from '.';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.initDB.mockResolvedValue({ get: mocks.get, getAll: mocks.getAll });
});

it('CAS-writes a project presentation only for the current root revision', async () => {
  const project = createVideoProjectEntry({}, { workspaceRevision: 3 });
  const put = vi.fn();
  mocks.runWithIndexedDbMutation.mockImplementation(async (effect) =>
    effect({
      transaction: vi.fn(() => ({
        done: Promise.resolve(),
        objectStore: vi.fn((name: string) =>
          name === 'video_projects' ? { get: vi.fn(async () => project) } : { put }
        ),
      })),
    })
  );

  await commitProjectAggregatePresentation({
    expectedWorkspaceRevision: 3,
    ref: { id: project.id, kind: 'video-project' },
    thumbnailBlob: new Blob(['cover']),
  });
  expect(put).toHaveBeenCalledWith(
    expect.objectContaining({
      aggregateId: project.id,
      aggregateKind: 'video-project',
      presentationRevision: 3,
    })
  );

  await expect(
    commitProjectAggregatePresentation({
      expectedWorkspaceRevision: 2,
      ref: { id: project.id, kind: 'video-project' },
      thumbnailBlob: new Blob(['stale']),
    })
  ).rejects.toThrow('changed during preview rendering');
  expect(put).toHaveBeenCalledTimes(1);
});

it('reads, lists, and resolves preview blobs through strict presentation parsing', async () => {
  const valid = {
    aggregateId: 'image-1',
    aggregateKind: 'image',
    presentationRevision: 2,
    previewBlob: new Blob(['preview']),
    thumbnailBlob: new Blob(['thumbnail']),
    updatedAt: 10,
  };
  mocks.get.mockResolvedValueOnce(valid).mockResolvedValueOnce(valid).mockResolvedValueOnce({});
  mocks.getAll.mockResolvedValue([{}, valid]);

  await expect(getAggregatePresentation({ id: 'image-1', kind: 'image' })).resolves.toEqual(valid);
  await expect(getAggregatePreviewBlob({ id: 'image-1', kind: 'image' })).resolves.toBe(
    valid.previewBlob
  );
  await expect(getAggregatePresentation({ id: 'invalid', kind: 'image' })).resolves.toBeUndefined();
  await expect(listAggregatePresentations()).resolves.toEqual([valid]);
  expect(mocks.get).toHaveBeenCalledWith('aggregate_presentations', ['image', 'image-1']);
});

it('deletes the exact compound presentation key through the mutation owner', async () => {
  mocks.runWithIndexedDbMutation.mockImplementation(async (effect) =>
    effect({ delete: mocks.delete })
  );

  await deleteAggregatePresentation({ id: 'scenario-1', kind: 'scenario' });

  expect(mocks.delete).toHaveBeenCalledWith('aggregate_presentations', ['scenario', 'scenario-1']);
});

it('writes scenario preview and thumbnail blobs against the scenario root revision', async () => {
  const project = createScenarioProject('Scenario');
  const root = {
    createdAt: 1,
    id: project.id,
    project,
    updatedAt: 2,
    workspaceRevision: 4,
  };
  const put = vi.fn();
  mocks.runWithIndexedDbMutation.mockImplementation(async (effect) =>
    effect({
      transaction: vi.fn(() => ({
        done: Promise.resolve(),
        objectStore: vi.fn((name: string) =>
          name === 'scenario_projects' ? { get: vi.fn(async () => root) } : { put }
        ),
      })),
    })
  );
  const previewBlob = new Blob(['preview']);

  await commitProjectAggregatePresentation({
    expectedWorkspaceRevision: 4,
    previewBlob,
    ref: { id: project.id, kind: 'scenario' },
    thumbnailBlob: new Blob(['thumbnail']),
  });

  expect(put).toHaveBeenCalledWith(
    expect.objectContaining({
      aggregateKind: 'scenario',
      presentationRevision: 4,
      previewBlob,
    })
  );
});

it('rejects presentation commits when the aggregate root is missing', async () => {
  mocks.runWithIndexedDbMutation.mockImplementation(async (effect) =>
    effect({
      transaction: vi.fn(() => ({
        done: Promise.resolve(),
        objectStore: vi.fn(() => ({ get: vi.fn(async () => undefined), put: vi.fn() })),
      })),
    })
  );

  await expect(
    commitProjectAggregatePresentation({
      expectedWorkspaceRevision: 0,
      ref: { id: 'missing', kind: 'video-project' },
      thumbnailBlob: new Blob(['thumbnail']),
    })
  ).rejects.toThrow('was not found');
});

it('treats a legacy root without workspaceRevision as revision zero', async () => {
  const current = createVideoProjectEntry();
  const { workspaceRevision: _legacyRevision, ...legacyRoot } = current;
  const put = vi.fn();
  mocks.runWithIndexedDbMutation.mockImplementation(async (effect) =>
    effect({
      transaction: vi.fn(() => ({
        done: Promise.resolve(),
        objectStore: vi.fn((name: string) =>
          name === 'video_projects' ? { get: vi.fn(async () => legacyRoot) } : { put }
        ),
      })),
    })
  );

  await commitProjectAggregatePresentation({
    expectedWorkspaceRevision: 0,
    ref: { id: current.id, kind: 'video-project' },
    thumbnailBlob: new Blob(['legacy']),
  });

  expect(put).toHaveBeenCalledWith(expect.objectContaining({ presentationRevision: 0 }));
});
