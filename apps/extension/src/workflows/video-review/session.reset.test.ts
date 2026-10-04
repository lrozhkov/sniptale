import { expect, it, vi } from 'vitest';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import {
  createQuickEditAdvancedState,
  createQuickEditAdvancedContent,
} from '../../features/video/review/advanced/defaults';
import { createVideoReviewSession } from './session';

function fixture() {
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  advanced.audio.original = { muted: true, volume: 0.5 };
  const snapshot: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 'source',
      formatVersion: 1,
      source: { duration: 10, width: 640, height: 360, mimeType: 'video/webm', size: 5 },
      revision: 7,
      cursor: 2,
      createdAt: 1,
      updatedAt: 1,
      advanced,
      history: [
        {
          id: 'cut-op',
          at: 1,
          target: 'edit',
          before: null,
          after: { id: 'cut', kind: 'cut', start: 1, end: 2, requestedStart: 1, requestedEnd: 2 },
        },
        {
          id: 'note-op',
          at: 2,
          target: 'annotation',
          before: null,
          after: { id: 'note', text: 'Note', anchor: { kind: 'point', time: 3 } },
        },
      ],
    },
    draft: {
      aggregateId: 'recording:r',
      revision: 3,
      updatedAt: 1,
      before: null,
      annotation: { id: 'draft', text: 'Draft', anchor: { kind: 'point', time: 4 } },
    },
  };
  let durable = structuredClone(snapshot);
  const deps = {
    saveVideoWorkspaceDraft: vi.fn(),
    saveVideoWorkspaceAdvanced: vi.fn(),
    commitVideoWorkspace: vi.fn(),
    moveVideoWorkspaceHistory: vi.fn(),
    readVideoWorkspace: vi.fn(async () => structuredClone(durable)),
    saveVideoWorkspaceSnapshot: vi.fn(async (args: { workspace: unknown; draft: unknown }) => {
      const { parseVideoWorkspace } =
        await import('../../composition/persistence/review-workspaces/parser');
      const workspace = parseVideoWorkspace(args.workspace);
      if (!workspace || args.draft !== null) throw new Error('Invalid reset');
      durable = { workspace: { ...workspace, revision: 8 }, draft: null };
      return structuredClone(durable);
    }),
  };
  return { snapshot, deps, session: createVideoReviewSession(snapshot, deps) };
}

it('atomically clears history, draft and legacy advanced baseline while preserving source and UI', async () => {
  const { session, deps, snapshot } = fixture();
  await session.reset();
  expect(deps.saveVideoWorkspaceSnapshot).toHaveBeenCalledWith(
    expect.objectContaining({
      expectedRevision: 7,
      expectedSourceAssetId: 'source',
      expectedDraftRevision: 3,
      draft: null,
    })
  );
  expect(session.getSnapshot().document).toEqual({
    annotations: [],
    canvasComments: [],
    edits: [],
    advancedContent: createQuickEditAdvancedContent(),
  });
  expect(session.getSnapshot().snapshot.workspace).toMatchObject({
    source: snapshot.workspace.source,
    sourceAssetId: 'source',
    cursor: 0,
    history: [],
    advanced: { ui: snapshot.workspace.advanced.ui },
  });
  await session.reload();
  expect(session.getSnapshot().document.edits).toEqual([]);
  expect(session.getSnapshot().snapshot.draft).toBeNull();
});

it.each(['storage', 'conflict', 'changed-source'])(
  'preserves edits and recovery draft when reset fails with %s',
  async (code) => {
    const { session, deps, snapshot } = fixture();
    deps.saveVideoWorkspaceSnapshot.mockRejectedValueOnce({ code });
    await expect(session.reset()).rejects.toEqual({ code });
    expect(session.getSnapshot()).toMatchObject({ snapshot, pending: 0, error: code });
    expect(session.getSnapshot().document.edits).toHaveLength(1);
    await session.reset();
    expect(session.getSnapshot().snapshot.workspace.history).toEqual([]);
  }
);

it('keeps reset local while autosave is off, then persists one clean snapshot', async () => {
  const { session, deps } = fixture();
  session.setAutosaveEnabled(false);
  await session.reset();
  expect(session.getSnapshot()).toMatchObject({
    dirty: true,
    snapshot: { draft: null, workspace: { history: [], cursor: 0 } },
  });
  expect(deps.saveVideoWorkspaceSnapshot).not.toHaveBeenCalled();
  session.setAutosaveEnabled(true);
  await session.flush();
  expect(deps.saveVideoWorkspaceSnapshot).toHaveBeenCalledTimes(1);
  expect(session.getSnapshot().dirty).toBe(false);
});

it('does not erase a dirty buffer when a reset write fails', async () => {
  const { session, deps } = fixture();
  session.setAutosaveEnabled(false);
  await session.saveDraft(null, null);
  deps.saveVideoWorkspaceSnapshot.mockRejectedValue({ code: 'storage' });
  session.setAutosaveEnabled(true);
  await expect(session.flush()).rejects.toThrow();
  const before = session.getSnapshot().snapshot;
  await expect(session.reset()).rejects.toEqual({ code: 'storage' });
  expect(session.getSnapshot().snapshot).toEqual(before);
  expect(session.getSnapshot().dirty).toBe(true);
});
