// @vitest-environment jsdom
import { EDITOR_AUTOSAVE_POLICY } from '../../features/autosave/policy';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import {
  parseVideoWorkspace,
  parseVideoWorkspaceDraft,
} from '../../composition/persistence/review-workspaces/parser';
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
    saveVideoWorkspaceDraft: vi.fn(),
    commitVideoWorkspace: vi.fn(),
    readVideoWorkspace: vi.fn(async () => structuredClone(snapshot)),
    moveVideoWorkspaceHistory: vi.fn(async () => structuredClone(snapshot)),
    saveVideoWorkspaceSnapshot: vi.fn(async (args) => {
      const workspace = parseVideoWorkspace(args.workspace);
      if (!workspace) throw new Error('Invalid fixture workspace.');
      const draft = parseVideoWorkspaceDraft(args.draft, workspace.source.duration);
      snapshot = {
        workspace: { ...workspace, revision: args.expectedRevision + 1 },
        draft: draft ? { ...draft, revision: (args.expectedDraftRevision ?? 0) + 1 } : null,
      };
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
  await act(async () => vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay + 1));
  expect(f.deps.saveVideoWorkspaceSnapshot).toHaveBeenCalledOnce();
  expect(f.session.getSnapshot().snapshot.draft?.annotation).toEqual(annotation);
  expect(f.checkpointRelease).not.toHaveBeenCalled();
  const implementation = f.deps.saveVideoWorkspaceSnapshot.getMockImplementation()!;
  let acknowledge!: () => void;
  f.deps.saveVideoWorkspaceSnapshot.mockImplementationOnce(async (args) => {
    await new Promise<void>((done) => {
      acknowledge = done;
    });
    return implementation(args);
  });
  let saving!: Promise<void>;
  await act(async () => {
    saving = composer.save({ durable: true });
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
  f.deps.saveVideoWorkspaceSnapshot.mockRejectedValueOnce(new Error('Quota'));
  await act(async () => {
    await expect(composer.save({ durable: true })).rejects.toThrow('Quota');
  });
  expect(f.checkpointRelease).not.toHaveBeenCalled();
  await act(async () => composer.save({ durable: true }));
  expect(f.checkpointRelease).toHaveBeenCalledOnce();
});

it('closes an acknowledged annotation recovery action when the composer unmounts', async () => {
  const f = setup();
  act(() => composer.change(annotation, null));
  await act(async () => composer.flush());
  expect(f.checkpointRelease).not.toHaveBeenCalled();
  await act(async () => f.session.flush());
  expect(f.checkpointRelease).not.toHaveBeenCalled();
  await act(async () => root.render(null));
  expect(f.checkpointRelease).toHaveBeenCalledOnce();
});
