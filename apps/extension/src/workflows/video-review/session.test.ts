import { expect, it, vi } from 'vitest';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { createVideoReviewSession } from './session';

const annotation = { id: 'a', text: 'Comment', anchor: { kind: 'point' as const, time: 1 } };
function initial(): VideoWorkspaceSnapshot {
  return {
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 'source',
      formatVersion: 1,
      source: { duration: 2, width: 640, height: 360, mimeType: 'video/webm', size: 5 },
      revision: 1,
      cursor: 0,
      history: [],
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
}

it('serializes draft then Save using the committed draft revision, without an extra history step', async () => {
  const snapshot = initial();
  const draft = { aggregateId: 'recording:r', annotation, before: null, revision: 4, updatedAt: 2 };
  const operation = {
    id: 'op',
    at: 2,
    target: 'annotation' as const,
    before: null,
    after: annotation,
  };
  const saved = {
    ...snapshot,
    workspace: { ...snapshot.workspace, revision: 2, cursor: 1, history: [operation] },
  };
  const deps = {
    saveVideoWorkspaceDraft: vi.fn(async () => ({ ...snapshot, draft })),
    commitVideoWorkspace: vi.fn(async () => saved),
    readVideoWorkspace: vi.fn(async () => snapshot),
    moveVideoWorkspaceHistory: vi.fn(async () => snapshot),
  };
  const session = createVideoReviewSession(snapshot, deps);
  const listener = vi.fn();
  const unsubscribe = session.subscribe(listener);
  const pendingDraft = session.saveDraft(annotation, null);
  const pendingSave = session.commit(operation, true);
  expect(session.getSnapshot().pending).toBe(2);
  await Promise.all([pendingDraft, pendingSave]);
  expect(deps.commitVideoWorkspace).toHaveBeenCalledWith(
    expect.objectContaining({
      expectedRevision: 1,
      expectedSourceAssetId: 'source',
      consumeDraftRevision: 4,
    })
  );
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
  expect(session.getSnapshot().document.annotations).toEqual([annotation]);
  expect(session.getSnapshot().pending).toBe(0);
  expect(listener).toHaveBeenCalled();
  unsubscribe();
});

it('keeps recovery and committed state after failed Save and exposes reload explicitly', async () => {
  const snapshot = initial();
  snapshot.draft = {
    aggregateId: 'recording:r',
    revision: 1,
    annotation,
    before: null,
    updatedAt: 2,
  };
  const deps = {
    saveVideoWorkspaceDraft: vi.fn(async () => snapshot),
    commitVideoWorkspace: vi.fn(async () => {
      throw { code: 'conflict' };
    }),
    readVideoWorkspace: vi.fn(async () => snapshot),
    moveVideoWorkspaceHistory: vi.fn(async () => snapshot),
  };
  const session = createVideoReviewSession(snapshot, deps);
  await expect(
    session.commit({ id: 'op', at: 2, target: 'annotation', before: null, after: annotation }, true)
  ).rejects.toEqual({ code: 'conflict' });
  expect(session.getSnapshot()).toMatchObject({ error: 'conflict', pending: 0, snapshot });
  await expect(session.flush()).rejects.toThrow();
  await session.reload();
  await session.history('undo');
  expect(session.getSnapshot().error).toBeNull();
  expect(session.getSnapshot().snapshot.draft?.annotation.text).toBe('Comment');
});
