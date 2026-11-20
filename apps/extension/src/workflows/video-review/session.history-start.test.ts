import { expect, it, vi } from 'vitest';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { resolveReviewWorkspaceHistoryCursor } from '../../composition/persistence/review-workspaces/history-cursor';
import type { ReviewHistoryMove } from '../../features/video/review/types';
import {
  parseVideoWorkspace,
  parseVideoWorkspaceDraft,
} from '../../composition/persistence/review-workspaces/parser';
import { createVideoReviewSession } from './session';

function fixture() {
  const advanced = createQuickEditAdvancedState();
  advanced.audio.original = { muted: true, volume: 0.5 };
  const initial: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 'source',
      formatVersion: 1,
      source: { duration: 10, width: 640, height: 360, mimeType: 'video/webm', size: 5 },
      revision: 3,
      cursor: 2,
      createdAt: 1,
      updatedAt: 1,
      advanced,
      history: [1, 2].map((at) => ({
        id: `note-${at}`,
        at,
        target: 'annotation' as const,
        before: null,
        after: {
          id: `note-${at}`,
          text: `Note ${at}`,
          anchor: { kind: 'point' as const, time: at },
        },
      })),
    },
    draft: null,
  };
  let durable = structuredClone(initial);
  const deps = {
    saveVideoWorkspaceDraft: vi.fn(),
    saveVideoWorkspaceAdvanced: vi.fn(),
    commitVideoWorkspace: vi.fn(),
    saveVideoWorkspaceSnapshot: vi.fn(async (args: { workspace: unknown; draft: unknown }) => {
      durable = {
        workspace: {
          ...parseVideoWorkspace(args.workspace)!,
          revision: durable.workspace.revision + 1,
        },
        draft: args.draft === null ? null : parseVideoWorkspaceDraft(args.draft, 10),
      };
      return structuredClone(durable);
    }),
    moveVideoWorkspaceHistory: vi.fn(async (args: { direction: ReviewHistoryMove }) => {
      durable.workspace.cursor = resolveReviewWorkspaceHistoryCursor(
        durable.workspace,
        args.direction
      );
      durable.workspace.revision++;
      return structuredClone(durable);
    }),
    readVideoWorkspace: vi.fn(async () => structuredClone(durable)),
  };
  return { initial, deps, session: createVideoReviewSession(initial, deps) };
}

it('returns directly to the saved baseline, retaining history, Redo and source across reopen', async () => {
  const { session, deps, initial } = fixture();
  await session.history('start');
  expect(session.getSnapshot().document.annotations).toEqual([]);
  expect(session.getSnapshot().document.advancedContent.audio.original).toEqual({
    muted: true,
    volume: 0.5,
  });
  expect(session.getSnapshot().snapshot.workspace).toMatchObject({
    cursor: 0,
    history: initial.workspace.history,
    sourceAssetId: 'source',
    advanced: initial.workspace.advanced,
  });
  await session.flush();
  await session.reload();
  await session.history('redo');
  expect(session.getSnapshot().document.annotations).toHaveLength(1);
  expect(deps.moveVideoWorkspaceHistory).not.toHaveBeenCalled();
  await session.reset();
  expect(session.getSnapshot().document.advancedContent.audio.original).toEqual({
    muted: false,
    volume: 1,
  });
  expect(session.getSnapshot().snapshot.workspace.history).toEqual([]);
});

it('seeks directly by retained entry identity with autosave off and saves that cursor on retry', async () => {
  const { session, deps } = fixture();
  try {
    session.setAutosaveEnabled(false);
    await session.history({ entryId: 'note-1' });
    expect(session.getSnapshot().document.annotations.map((note) => note.id)).toEqual(['note-1']);
    expect(session.getSnapshot().snapshot.workspace.cursor).toBe(1);
    await session.history({ entryId: 'note-2' });
    expect(session.getSnapshot().snapshot.workspace.cursor).toBe(2);
    await session.history({ entryId: 'note-1' });
    expect(deps.moveVideoWorkspaceHistory).not.toHaveBeenCalled();
    deps.saveVideoWorkspaceSnapshot.mockRejectedValueOnce(new Error('Quota'));
    session.setAutosaveEnabled(true);
    await expect(session.flush()).rejects.toThrow('Quota');
    expect(session.getSnapshot().snapshot.workspace.cursor).toBe(1);
    await session.flush();
    await session.reload();
    expect(session.getSnapshot().snapshot.workspace.cursor).toBe(1);
    await session.history('redo');
    expect(session.getSnapshot().snapshot.workspace.cursor).toBe(2);
  } finally {
    await session.dispose();
  }
});

it('does not retarget a queued seek after an earlier queued edit replaces its selected entry', async () => {
  const { session } = fixture();
  try {
    session.setAutosaveEnabled(false);
    await session.history('start');
    const commit = session.commit({
      id: 'branch',
      at: 3,
      target: 'annotation',
      before: null,
      after: { id: 'branch', text: 'Branch', anchor: { kind: 'point', time: 3 } },
    });
    const seek = session.history({ entryId: 'note-2' });
    const [committed, selected] = await Promise.all([commit, seek]);
    expect(selected).toBe(committed);
    expect(session.getSnapshot().snapshot.workspace.cursor).toBe(1);
    expect(session.getSnapshot().document.annotations.map((note) => note.id)).toEqual(['branch']);
  } finally {
    await session.dispose();
  }
});

it('buffers start with autosave off and persists the retained history when enabled', async () => {
  const { session, deps, initial } = fixture();
  session.setAutosaveEnabled(false);
  await session.history('start');
  expect(session.getSnapshot()).toMatchObject({
    dirty: true,
    snapshot: { workspace: { cursor: 0, history: initial.workspace.history, revision: 3 } },
  });
  expect(deps.moveVideoWorkspaceHistory).not.toHaveBeenCalled();
  session.setAutosaveEnabled(true);
  await session.flush();
  expect(deps.saveVideoWorkspaceSnapshot).toHaveBeenCalledTimes(1);
  await session.reload();
  expect(session.getSnapshot().snapshot.workspace.cursor).toBe(0);
});

it('retains local cursor, history and Redo after failed publication and retries without another action', async () => {
  const { session, deps, initial } = fixture();
  try {
    deps.saveVideoWorkspaceSnapshot.mockRejectedValueOnce(new Error('Quota'));
    await session.history('start');
    expect(session.getSnapshot().snapshot.workspace.cursor).toBe(0);
    await expect(session.flush()).rejects.toThrow('Quota');
    expect(session.getSnapshot()).toMatchObject({ dirty: true, error: 'storage' });
    expect(session.getSnapshot().snapshot.workspace.history).toEqual(initial.workspace.history);
    await session.flush();
    expect(session.getSnapshot()).toMatchObject({ dirty: false, error: null });
    await session.reload();
    await session.history('redo');
    expect(session.getSnapshot().document.annotations).toHaveLength(1);
  } finally {
    await session.dispose();
  }
});

it('does not ignore a history publication failure while the durable barrier is waiting', async () => {
  const { session, deps } = fixture();
  let reject!: (error: Error) => void;
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  deps.saveVideoWorkspaceSnapshot.mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
        markStarted();
      })
  );
  try {
    await session.history('start');
    const flushed = session.flush({ retryHistory: true });
    await started;
    reject(new Error('Quota'));
    await expect(flushed).rejects.toThrow('Quota');
    expect(session.getSnapshot()).toMatchObject({
      dirty: true,
      error: 'storage',
      snapshot: { workspace: { cursor: 0 } },
    });
  } finally {
    await session.dispose();
  }
});
