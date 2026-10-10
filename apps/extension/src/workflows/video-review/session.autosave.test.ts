import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { createVideoReviewSession } from './session';

function setup() {
  let stored: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 'source',
      formatVersion: 1,
      source: { duration: 4, width: 640, height: 360, mimeType: 'video/webm', size: 5 },
      revision: 1,
      cursor: 0,
      history: [],
      advanced: createQuickEditAdvancedState(),
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  const read = vi.fn(async () => structuredClone(stored));
  const deps = {
    readVideoWorkspace: read,
    moveVideoWorkspaceHistory: read,
    saveVideoWorkspaceDraft: read,
    saveVideoWorkspaceAdvanced: vi.fn(async (args) => {
      stored = {
        ...stored,
        workspace: {
          ...stored.workspace,
          revision: stored.workspace.revision + 1,
          advanced: args.advanced,
        },
      };
      return structuredClone(stored);
    }),
    commitVideoWorkspace: vi.fn(async (args) => {
      stored = {
        ...stored,
        workspace: {
          ...stored.workspace,
          history: [...stored.workspace.history, args.operation],
          cursor: stored.workspace.cursor + 1,
          revision: stored.workspace.revision + 1,
        },
      };
      return structuredClone(stored);
    }),
    saveVideoWorkspaceSnapshot: vi.fn(async (args) => {
      stored = {
        workspace: { ...args.workspace, revision: stored.workspace.revision + 1 },
        draft: args.draft,
      };
      return structuredClone(stored);
    }),
  } satisfies Parameters<typeof createVideoReviewSession>[1];
  const session = createVideoReviewSession(stored, deps);
  return { session, deps };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('includes staged producers in a session barrier and builds history from the admitted document', async () => {
  const { session, deps } = setup();
  const before = session.getSnapshot().document.advancedContent;
  const first = { ...before, actionsEnabled: false };
  const second = { ...first, zoom: { ...first.zoom, enabled: true } };
  let current = first;
  const acknowledge = vi.fn();
  const fail = vi.fn();
  session.stageAutosave(
    'content',
    () => ({ change: { kind: 'content', content: current }, acknowledge, fail }),
    { delay: 250 }
  );
  await session.flush();
  current = second;
  session.stageAutosave(
    'content',
    () => ({ change: { kind: 'content', content: current }, acknowledge, fail }),
    { delay: 250 }
  );
  await session.flush();
  expect(deps.commitVideoWorkspace.mock.calls[1]?.[0].operation).toMatchObject({
    before: first,
    after: second,
  });
  expect(acknowledge).toHaveBeenCalledTimes(2);
  expect(fail).not.toHaveBeenCalled();
});

it('applies paused autosave locally and only explicit Save acknowledges a durable snapshot', async () => {
  const { session, deps } = setup();
  session.setAutosaveEnabled(false);
  const before = session.getSnapshot().document.advancedContent;
  session.stageAutosave(
    'content',
    () => ({
      change: { kind: 'content', content: { ...before, actionsEnabled: false } },
      acknowledge: () => undefined,
      fail: () => undefined,
    }),
    { delay: 250 }
  );
  await session.flush();
  expect(session.getSnapshot()).toMatchObject({ dirty: true, autosaveEnabled: false });
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
  expect(deps.commitVideoWorkspace).not.toHaveBeenCalled();
  expect(deps.saveVideoWorkspaceSnapshot).not.toHaveBeenCalled();
  await session.saveBuffered();
  expect(deps.saveVideoWorkspaceSnapshot).toHaveBeenCalledTimes(1);
  expect(session.getSnapshot()).toMatchObject({ dirty: false, autosaveEnabled: false });
});

it('retains a failed staged buffer and stops other autosaves until source recovery', async () => {
  const { session, deps } = setup();
  deps.commitVideoWorkspace.mockRejectedValueOnce({ code: 'changed-source' });
  const content = { ...session.getSnapshot().document.advancedContent, actionsEnabled: false };
  const acknowledge = vi.fn();
  const fail = vi.fn();
  session.stageAutosave(
    'content',
    () => ({ change: { kind: 'content', content }, acknowledge, fail }),
    { delay: 250 }
  );
  await expect(session.flush()).rejects.toMatchObject({ code: 'changed-source' });
  expect(acknowledge).not.toHaveBeenCalled();
  session.stageAutosave(
    'advanced',
    () => ({
      change: { kind: 'advanced', advanced: session.getSnapshot().snapshot.workspace.advanced },
      acknowledge,
      fail,
    }),
    { delay: 250 }
  );
  await vi.advanceTimersByTimeAsync(1000);
  await expect(session.flushAutosave(['advanced'])).rejects.toMatchObject({
    code: 'changed-source',
  });
  expect(deps.saveVideoWorkspaceAdvanced).not.toHaveBeenCalled();
  await session.reload();
  expect(session.getSnapshot().error).toBeNull();
  await session.flush();
  expect(deps.commitVideoWorkspace).toHaveBeenCalledTimes(1);
});
