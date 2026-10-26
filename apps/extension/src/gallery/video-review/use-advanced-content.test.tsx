// @vitest-environment jsdom
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { createCameraFollowSettings } from '../../features/video/project/camera/cursor-policy';
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

it('publishes camera defaults through the existing native history writer and reset removes only policy', async () => {
  const { session, commit } = setup();
  const cameraFollowDefaults = createCameraFollowSettings('calm');
  act(() => content.commands.setCameraFollowDefaults(cameraFollowDefaults));
  expect(content.content.cameraFollowDefaults).toEqual(cameraFollowDefaults);
  await act(async () => {
    await content.flush();
  });
  expect(commit).toHaveBeenCalledTimes(1);
  expect(session.getSnapshot().document.advancedContent.cameraFollowDefaults).toEqual(
    cameraFollowDefaults
  );
  act(() => content.commands.setCameraFollowDefaults(undefined));
  await act(async () => {
    await content.flush();
  });
  expect(session.getSnapshot().document.advancedContent.cameraFollowDefaults).toBeUndefined();
  expect(commit).toHaveBeenCalledTimes(2);
});

it('retains separate content operations for completed pointer gesture boundaries before debounce', async () => {
  const { session, commit } = setup();
  const region = createQuickEditZoomRegion({ id: 'gesture-focus', at: 0, duration: 1, endMax: 4 });
  act(() => content.commands.setZoom((zoom) => ({ ...zoom, enabled: true, regions: [region] })));
  await act(async () => content.flush());
  expect(commit).toHaveBeenCalledOnce();
  for (const centerX of [0.6, 0.7, 0.8]) {
    act(() => {
      content.endTyping();
      content.commands.setZoom((zoom) => ({
        ...zoom,
        regions: zoom.regions.map((entry) => ({
          ...entry,
          transform: { ...entry.transform, centerX },
        })),
      }));
    });
  }
  await act(async () => content.flush());
  const operations = session.getSnapshot().snapshot.workspace.history.slice(1);
  expect(operations).toHaveLength(3);
  expect(
    operations.map((operation) =>
      operation.target === 'advancedContent'
        ? [
            operation.before.zoom.regions[0]?.transform.centerX,
            operation.after.zoom.regions[0]?.transform.centerX,
          ]
        : null
    )
  ).toEqual([
    [0.5, 0.6],
    [0.6, 0.7],
    [0.7, 0.8],
  ]);
  expect(commit).toHaveBeenCalledTimes(4);
});

it('retries an older failed capture before a later closed command group', async () => {
  const { session, commit } = setup();
  let rejectCapture!: (error: Error) => void;
  commit.mockImplementationOnce(
    async () =>
      new Promise<VideoWorkspaceSnapshot>((_resolve, reject) => {
        rejectCapture = reject;
      })
  );
  act(() => content.commands.setActionsEnabled(false));
  await act(async () => vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay));
  act(() => {
    content.endTyping();
    content.commands.setZoom((zoom) => ({ ...zoom, enabled: true }));
  });
  await act(async () => {
    rejectCapture(new Error('Controlled first capture failure'));
    await Promise.resolve();
  });
  expect(content.saveFailed).toBe(true);
  expect(content.content).toMatchObject({ actionsEnabled: false, zoom: { enabled: true } });
  expect(content.pending).toBe(true);
  await act(async () => content.flush());
  const operations = session.getSnapshot().snapshot.workspace.history;
  expect(operations).toHaveLength(2);
  expect(operations[0]).toMatchObject({
    target: 'advancedContent',
    before: { zoom: { enabled: false } },
    after: { actionsEnabled: false, zoom: { enabled: false } },
  });
  expect(operations[0]).not.toHaveProperty('before.actionsEnabled');
  expect(operations[1]).toMatchObject({
    target: 'advancedContent',
    before: { actionsEnabled: false, zoom: { enabled: false } },
    after: { actionsEnabled: false, zoom: { enabled: true } },
  });
  expect(content.pending).toBe(false);
  expect(content.saveFailed).toBe(false);
  expect(commit).toHaveBeenCalledTimes(3);
});
