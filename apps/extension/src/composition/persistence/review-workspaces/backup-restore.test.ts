import { expect, it, vi } from 'vitest';
import {
  parsePortableVideoReview,
  prepareVideoReviewRestore,
  putVideoReviewRestore,
  readVideoReviewForBackup,
} from './backup-restore';
import type { VideoWorkspace } from './contracts';

const annotation = { id: 'a', text: 'Comment', anchor: { kind: 'point' as const, time: 1 } };
const workspace: VideoWorkspace = {
  aggregateId: 'recording:one',
  formatVersion: 1,
  sourceAssetId: 'original-local',
  source: { duration: 2, width: 640, height: 360, size: 6, mimeType: 'video/webm' },
  revision: 4,
  cursor: 0,
  history: [{ id: 'op', at: 2, target: 'annotation', before: null, after: annotation }],
  createdAt: 1,
  updatedAt: 3,
};
const draft = {
  aggregateId: workspace.aggregateId,
  revision: 3,
  annotation: { ...annotation, text: 'Unsaved' },
  before: null,
  updatedAt: 3,
};

it('exports full undo/redo and field recovery, excluding the local source object identity', async () => {
  const review = await readVideoReviewForBackup({
    aggregateId: workspace.aggregateId,
    sourceAssetId: 'original-local',
    db: snapshotDatabase(workspace, draft),
  });
  expect(review?.workspace.history).toEqual(workspace.history);
  expect(review?.workspace.cursor).toBe(0);
  expect(review?.workspace).not.toHaveProperty('sourceAssetId');
  expect(review?.draft).toEqual(draft);
  const restored = prepareVideoReviewRestore({
    review: review!,
    sourceAggregateId: workspace.aggregateId,
    targetAggregateId: 'recording:duplicate',
    sourceAssetId: 'new-local',
  });
  expect(restored.workspace.aggregateId).toBe('recording:duplicate');
  expect(restored.workspace.sourceAssetId).toBe('new-local');
  expect(restored.draft?.aggregateId).toBe('recording:duplicate');
  expect(restored.workspace.history).toEqual(workspace.history);
  const workspaces = { put: vi.fn() };
  const drafts = { put: vi.fn(), delete: vi.fn() };
  await putVideoReviewRestore({ review: restored, workspaces, drafts });
  expect(workspaces.put).toHaveBeenCalledWith(restored.workspace);
  expect(drafts.put).toHaveBeenCalledWith(restored.draft);
  expect(drafts.delete).not.toHaveBeenCalled();
});

it('refuses corrupt or stale source state instead of silently dropping it from backup', async () => {
  const db = snapshotDatabase(workspace, undefined);
  await expect(
    readVideoReviewForBackup({
      db,
      aggregateId: workspace.aggregateId,
      sourceAssetId: 'replacement',
    })
  ).rejects.toThrow('source');
  const { sourceAssetId: _local, ...portable } = workspace;
  expect(() => parsePortableVideoReview({ workspace: portable, draft }, 'recording:wrong')).toThrow(
    'association'
  );
  expect(() => parsePortableVideoReview({ workspace, draft }, workspace.aggregateId)).toThrow(
    'invalid'
  );
  expect(() =>
    parsePortableVideoReview(
      { workspace: { ...portable, history: [...portable.history, ...portable.history] }, draft },
      workspace.aggregateId
    )
  ).toThrow();
  expect(() =>
    parsePortableVideoReview(
      { workspace: portable, draft: { ...draft, aggregateId: 'wrong' } },
      workspace.aggregateId
    )
  ).toThrow();
  await expect(
    readVideoReviewForBackup({
      db: snapshotDatabase(undefined, undefined),
      aggregateId: workspace.aggregateId,
      sourceAssetId: 'original-local',
    })
  ).resolves.toBeUndefined();
});

it('keeps recovery text when a draft-consuming Save interleaves with backup reads', async () => {
  const pendingWorkspace: VideoWorkspace = { ...workspace, history: [], cursor: 0 };
  let currentWorkspace = pendingWorkspace;
  let currentDraft: typeof draft | undefined = draft;
  const save = () => {
    currentWorkspace = {
      ...workspace,
      cursor: 1,
      history: [{ id: 'save', at: 4, target: 'annotation', before: null, after: draft.annotation }],
    };
    currentDraft = undefined;
  };
  const db = {
    get: async (store: string) => {
      if (store !== 'video_workspaces') return currentDraft;
      const value = currentWorkspace;
      save();
      return value;
    },
    transaction: () => {
      const capturedWorkspace = currentWorkspace;
      const capturedDraft = currentDraft;
      return {
        objectStore: (store: string) => ({
          get: async () => {
            save();
            return store === 'video_workspaces' ? capturedWorkspace : capturedDraft;
          },
        }),
        done: Promise.resolve(),
      };
    },
  };
  const review = await readVideoReviewForBackup({
    db,
    aggregateId: workspace.aggregateId,
    sourceAssetId: workspace.sourceAssetId,
  });
  expect(review?.draft?.annotation.text).toBe('Unsaved');
  expect(review?.workspace.history).toEqual([]);
});

function snapshotDatabase(raw: unknown, rawDraft: unknown) {
  return {
    transaction: () => ({
      objectStore: (store: string) => ({
        get: async () => (store === 'video_workspaces' ? raw : rawDraft),
      }),
      done: Promise.resolve(),
    }),
  };
}
