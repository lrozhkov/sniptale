// @vitest-environment jsdom
import { EDITOR_AUTOSAVE_POLICY } from '../../features/autosave/policy';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import { useReviewComposer, useReviewSnapshot } from './use-session';

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
      advanced: createQuickEditAdvancedState(),
      history: [],
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  const checkpointRelease = vi.fn(async () => undefined);
  const deps = {
    acquireSyncCheckpointEdit: vi.fn(async () => ({ release: checkpointRelease })),
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
    saveVideoWorkspaceSnapshot: vi.fn(async (args) => {
      snapshot = { workspace: args.workspace, draft: args.draft };
      return structuredClone(snapshot);
    }),
    saveVideoWorkspaceAdvanced: vi.fn(async () => structuredClone(snapshot)),
  } satisfies Parameters<typeof createVideoReviewSession>[1];
  const session = createVideoReviewSession(snapshot, deps);
  function Harness() {
    useReviewSnapshot(session);
    composer = useReviewComposer(session);
    return null;
  }
  act(() => root.render(<Harness />));
  return { session, deps, Harness, checkpointRelease };
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

it('keeps recovery draft acknowledgements excluded until the annotation Save acknowledgement', async () => {
  const f = setup();
  act(() => composer.change(annotation, null));
  await act(async () => vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay));
  expect(f.deps.saveVideoWorkspaceDraft).toHaveBeenCalledOnce();
  expect(f.checkpointRelease).not.toHaveBeenCalled();
  const implementation = f.deps.commitVideoWorkspace.getMockImplementation()!;
  let acknowledge!: () => void;
  f.deps.commitVideoWorkspace.mockImplementationOnce(async (args) => {
    await new Promise<void>((done) => {
      acknowledge = done;
    });
    return implementation(args);
  });
  let saving!: Promise<void>;
  await act(async () => {
    saving = composer.save();
  });
  expect(f.checkpointRelease).not.toHaveBeenCalled();
  await act(async () => {
    acknowledge();
    await saving;
  });
  expect(f.checkpointRelease).toHaveBeenCalledOnce();
});

it('retains a failed completed annotation action through explicit retry', async () => {
  const f = setup();
  act(() => composer.change(annotation, null));
  await act(async () => composer.flush());
  f.deps.commitVideoWorkspace.mockRejectedValueOnce(new Error('Quota'));
  await act(async () => {
    await expect(composer.save()).rejects.toThrow('Quota');
  });
  expect(f.checkpointRelease).not.toHaveBeenCalled();
  await act(async () => composer.save());
  expect(f.checkpointRelease).toHaveBeenCalledOnce();
});

it('closes an acknowledged annotation recovery action when the composer unmounts', async () => {
  const f = setup();
  act(() => composer.change(annotation, null));
  await act(async () => composer.flush());
  expect(f.checkpointRelease).not.toHaveBeenCalled();
  await act(async () => root.render(null));
  expect(f.checkpointRelease).toHaveBeenCalledOnce();
});
