// @vitest-environment jsdom
import { EDITOR_AUTOSAVE_POLICY } from '../../features/autosave/policy';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { parseReviewOperation } from '../../features/video/review/validation';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import { useReviewAdvancedContent } from './use-advanced-content';
import { useReviewSnapshot } from './use-session';
import {
  patchReviewActionAudio,
  type ReviewActionAudioTarget,
} from '../../features/video/review/advanced/action-audio';

let root: Root;
let content: ReturnType<typeof useReviewAdvancedContent>;
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
  const commit = vi.fn(
    async (
      args: Parameters<
        NonNullable<Parameters<typeof createVideoReviewSession>[1]>['commitVideoWorkspace']
      >[0]
    ) => {
      const operation = parseReviewOperation(args.operation, 4);
      if (!operation) throw new Error('Invalid fixture operation.');
      stored = {
        ...stored,
        workspace: {
          ...stored.workspace,
          history: [...stored.workspace.history, operation],
          cursor: stored.workspace.cursor + 1,
          revision: stored.workspace.revision + 1,
        },
      };
      return structuredClone(stored);
    }
  );
  const session = createVideoReviewSession(stored, {
    commitVideoWorkspace: commit,
    readVideoWorkspace: read,
    moveVideoWorkspaceHistory: read,
    saveVideoWorkspaceAdvanced: read,
    saveVideoWorkspaceDraft: read,
    saveVideoWorkspaceSnapshot: read,
  });
  function Harness() {
    const snapshot = useReviewSnapshot(session);
    content = useReviewAdvancedContent(session, snapshot.document.advancedContent);
    return null;
  }
  act(() => root.render(<Harness />));
  return { session, commit };
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  root = createRoot(document.createElement('div'));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('rebases newer buffered mutations onto an acknowledged target and retains their debounce', async () => {
  const { session, commit } = setup();
  const implementation = commit.getMockImplementation()!;
  let release!: () => void;
  commit.mockImplementationOnce(async (args) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return implementation(args);
  });
  act(() => content.commands.setActionsEnabled(false));
  await act(async () => vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay));
  act(() => content.commands.setZoom((zoom) => ({ ...zoom, enabled: true })));
  await act(async () => {
    release();
    await Promise.resolve();
  });
  expect(content.content).toMatchObject({ actionsEnabled: false, zoom: { enabled: true } });
  expect(content.pending).toBe(true);
  expect(commit).toHaveBeenCalledTimes(1);
  await act(async () => content.flush());
  expect(commit.mock.calls[1]?.[0].operation).toMatchObject({
    before: { actionsEnabled: false, zoom: { enabled: false } },
    after: { actionsEnabled: false, zoom: { enabled: true } },
  });
  expect(content.pending).toBe(false);
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(2);
});

it('does not acknowledge a new generation with an acquired pre-reset mutation journal', async () => {
  const { commit } = setup();
  const implementation = commit.getMockImplementation()!;
  let release!: () => void;
  commit.mockImplementationOnce(async (args) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return implementation(args);
  });
  act(() => content.commands.setActionsEnabled(false));
  await act(async () => vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay));
  act(() => {
    content.reset();
    content.commands.setZoom((zoom) => ({ ...zoom, enabled: true }));
  });
  await act(async () => {
    release();
    await Promise.resolve();
  });
  expect(content.pending).toBe(true);
  expect(content.content.zoom.enabled).toBe(true);
  await act(async () => content.flush());
  expect(commit).toHaveBeenCalledTimes(2);
  expect(content.pending).toBe(false);
});

it('writes one action-sound batch, preserves unrelated content and rejects no-op reset history', async () => {
  const { session, commit } = setup();
  const targets: ReviewActionAudioTarget[] = [
    { ref: { kind: 'action', id: 'same' }, family: 'mouse' },
    { ref: { kind: 'signal', id: 'same' }, family: 'typing' },
  ];
  await act(async () =>
    content.commands.setActionAudio((current) =>
      patchReviewActionAudio(current, targets, { enabled: true })
    )
  );
  await act(async () => content.flush());
  expect(commit).toHaveBeenCalledOnce();
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
  expect(content.content.actionAudio).toHaveLength(2);
  expect(content.content.audio).toEqual(createQuickEditAdvancedState().audio);
  await act(async () =>
    content.commands.setActionAudio((current) =>
      patchReviewActionAudio(current, targets, { enabled: true })
    )
  );
  await act(async () => content.flush());
  expect(commit).toHaveBeenCalledOnce();
  await act(async () =>
    content.commands.setActionAudio((current) => patchReviewActionAudio(current, targets, null))
  );
  await act(async () => content.flush());
  expect(commit).toHaveBeenCalledTimes(2);
  expect(content.content).not.toHaveProperty('actionAudio');
  await act(async () =>
    content.commands.setActionAudio((current) => patchReviewActionAudio(current, targets, null))
  );
  await act(async () => content.flush());
  expect(commit).toHaveBeenCalledTimes(2);
});
