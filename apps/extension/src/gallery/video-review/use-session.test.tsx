// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import { useReviewComposer } from './use-session';

let root: Root;
let host: HTMLDivElement;
let composer: ReturnType<typeof useReviewComposer>;
const annotation = {
  id: 'comment',
  text: 'Final dictated text',
  anchor: { kind: 'point' as const, time: 1 },
};
function setup() {
  let snapshot: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 'asset',
      formatVersion: 1,
      source: { duration: 4, width: 320, height: 180, mimeType: 'video/webm', size: 200 },
      revision: 1,
      cursor: 0,
      history: [],
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  const deps = {
    saveVideoWorkspaceDraft: vi.fn(async (args) => {
      snapshot = {
        ...snapshot,
        draft: args.annotation
          ? {
              aggregateId: 'recording:r',
              annotation: args.annotation,
              before: args.before,
              revision: (snapshot.draft?.revision ?? 0) + 1,
              updatedAt: 2,
            }
          : null,
      };
      return structuredClone(snapshot);
    }),
    commitVideoWorkspace: vi.fn(async (args) => {
      snapshot = {
        ...snapshot,
        workspace: {
          ...snapshot.workspace,
          history: [...snapshot.workspace.history, args.operation],
          cursor: snapshot.workspace.cursor + 1,
          revision: snapshot.workspace.revision + 1,
        },
        draft: null,
      };
      return structuredClone(snapshot);
    }),
    readVideoWorkspace: vi.fn(async () => structuredClone(snapshot)),
    moveVideoWorkspaceHistory: vi.fn(async () => structuredClone(snapshot)),
  } satisfies Parameters<typeof createVideoReviewSession>[1];
  const session = createVideoReviewSession(snapshot, deps);
  function Harness() {
    composer = useReviewComposer(session);
    return null;
  }
  act(() => root.render(<Harness />));
  return { session, deps, Harness };
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  host = document.createElement('div');
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('coalesces many field changes, restores recovery on reopen, and commits exactly one operation', async () => {
  const { session, deps, Harness } = setup();
  act(() => {
    composer.change({ ...annotation, text: 'F' }, null);
    composer.change({ ...annotation, text: 'Final' });
    composer.change(annotation);
  });
  expect(deps.saveVideoWorkspaceDraft).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(250));
  expect(deps.saveVideoWorkspaceDraft).toHaveBeenCalledTimes(1);
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(0);
  await act(async () => root.render(null));
  act(() => root.render(<Harness />));
  expect(composer.annotation?.text).toBe(annotation.text);
  await act(async () => composer.save());
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
  expect(session.getSnapshot().snapshot.draft).toBeNull();
  expect(composer.annotation).toBeNull();
});

it('retains text after failed commit and allows retry without duplicate history', async () => {
  const { session, deps } = setup();
  deps.commitVideoWorkspace.mockRejectedValueOnce(new Error('Quota'));
  act(() => composer.change(annotation, null));
  await act(async () => {
    await expect(composer.save()).rejects.toThrow('Quota');
  });
  expect(composer.annotation?.text).toBe(annotation.text);
  expect(session.getSnapshot().snapshot.draft?.annotation.text).toBe(annotation.text);
  await act(async () => composer.save());
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
});

it('keeps later typing dirty while an older recovery write is pending', async () => {
  const { deps } = setup();
  const original = deps.saveVideoWorkspaceDraft.getMockImplementation()!;
  let release!: () => void;
  deps.saveVideoWorkspaceDraft.mockImplementationOnce(async (args) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return original(args);
  });
  act(() => composer.change({ ...annotation, text: 'old' }, null));
  let flush!: Promise<void>;
  await act(async () => {
    flush = composer.flush();
    await Promise.resolve();
  });
  act(() => composer.change(annotation));
  await act(async () => {
    release();
    await flush;
  });
  expect(deps.saveVideoWorkspaceDraft).toHaveBeenCalledTimes(2);
  expect(composer.annotation?.text).toBe(annotation.text);
  expect(composer.dirty).toBe(false);
});

it('clears an unchanged edit without adding history and explicitly reloads saved recovery', async () => {
  const { deps, session } = setup();
  act(() => composer.change(annotation, annotation));
  await act(async () => composer.save());
  expect(deps.commitVideoWorkspace).not.toHaveBeenCalled();
  expect(composer.annotation).toBeNull();
  act(() => composer.change(annotation, null));
  await act(async () => composer.flush());
  act(() => composer.change({ ...annotation, text: 'Local unsaved edit' }));
  await act(async () => composer.reload());
  expect(composer.annotation?.text).toBe(annotation.text);
  expect(composer.dirty).toBe(false);
  await act(async () => composer.discard());
  expect(session.getSnapshot().snapshot.draft).toBeNull();
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(0);
});
