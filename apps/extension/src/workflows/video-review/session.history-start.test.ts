import { expect, it, vi } from 'vitest';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
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
    moveVideoWorkspaceHistory: vi.fn(async (args: { direction: 'undo' | 'redo' | 'start' }) => {
      durable.workspace.cursor =
        args.direction === 'start'
          ? 0
          : durable.workspace.cursor + (args.direction === 'undo' ? -1 : 1);
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
  await session.reload();
  await session.history('redo');
  expect(session.getSnapshot().document.annotations).toHaveLength(1);
  expect(deps.moveVideoWorkspaceHistory).toHaveBeenCalledTimes(2);
  await session.reset();
  expect(session.getSnapshot().document.advancedContent.audio.original).toEqual({
    muted: false,
    volume: 1,
  });
  expect(session.getSnapshot().snapshot.workspace.history).toEqual([]);
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

it('allows recovery only from a completed history failure, leaving normal flush strict', async () => {
  const { session, deps, initial } = fixture();
  deps.moveVideoWorkspaceHistory.mockRejectedValueOnce(new Error('Quota'));
  await expect(session.history('start')).rejects.toThrow('Quota');
  expect(session.getSnapshot().snapshot).toEqual(initial);
  await expect(session.flush()).rejects.toThrow('storage');
  await session.flush({ retryHistory: true });
  await session.history('start');
  expect(session.getSnapshot()).toMatchObject({
    error: null,
    snapshot: { workspace: { cursor: 0 } },
  });
  deps.saveVideoWorkspaceAdvanced.mockRejectedValueOnce(new Error('Content failure'));
  await expect(session.saveAdvanced(initial.workspace.advanced)).rejects.toThrow();
  await expect(session.flush({ retryHistory: true })).rejects.toThrow('storage');
});

it('does not ignore a history write that fails while flush is waiting', async () => {
  const { session, deps } = fixture();
  let reject!: (error: Error) => void;
  deps.moveVideoWorkspaceHistory.mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      })
  );
  const operation = session.history('start').catch(() => undefined);
  const flushed = session.flush({ retryHistory: true });
  await Promise.resolve();
  reject(new Error('Quota'));
  await expect(flushed).rejects.toThrow('storage');
  await operation;
});
