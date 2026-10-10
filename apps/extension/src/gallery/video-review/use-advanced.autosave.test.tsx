// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { loadQuickEditAdvancedState } from '../../features/video/review/advanced/validation';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import { useReviewAdvanced } from './use-advanced';

let root: Root;
let writer: ReturnType<typeof useReviewAdvanced>;
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
  const save = vi.fn(
    async (
      args: Parameters<
        NonNullable<Parameters<typeof createVideoReviewSession>[1]>['saveVideoWorkspaceAdvanced']
      >[0]
    ) => {
      const advanced = loadQuickEditAdvancedState(args.advanced);
      if (!advanced) throw new Error('Invalid fixture advanced state.');
      stored = {
        ...stored,
        workspace: { ...stored.workspace, advanced, revision: stored.workspace.revision + 1 },
      };
      return structuredClone(stored);
    }
  );
  const session = createVideoReviewSession(stored, {
    saveVideoWorkspaceAdvanced: save,
    readVideoWorkspace: read,
    saveVideoWorkspaceSnapshot: read,
    saveVideoWorkspaceDraft: read,
    commitVideoWorkspace: read,
    moveVideoWorkspaceHistory: read,
  });
  function Harness() {
    writer = useReviewAdvanced(session);
    return null;
  }
  act(() => root.render(<Harness />));
  return { session, save };
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

it('shows edits made during a write and preserves the new UI debounce after its old acknowledgement', async () => {
  const { save } = setup();
  const implementation = save.getMockImplementation()!;
  let release!: () => void;
  save.mockImplementationOnce(async (args) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return implementation(args);
  });
  act(() => writer.setOverlaysVisible(false));
  await act(async () => vi.advanceTimersByTimeAsync(250));
  act(() => writer.setOverlaysVisible(true));
  expect(writer.advanced.ui.overlaysVisible).toBe(true);
  await act(async () => {
    release();
    await Promise.resolve();
  });
  expect(save).toHaveBeenCalledTimes(1);
  expect(writer.pending).toBe(true);
  await act(async () => vi.advanceTimersByTimeAsync(249));
  expect(save).toHaveBeenCalledTimes(1);
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(save).toHaveBeenCalledTimes(2);
  expect(writer.pending).toBe(false);
});

it('does not transfer content acknowledgement through a UI-only barrier', async () => {
  const { session, save } = setup();
  const initialContent = session.getSnapshot().document.advancedContent;
  act(() => {
    writer.setActionsEnabled(false);
    writer.setOverlaysVisible(false);
  });
  await act(async () => session.flushAutosave(['advanced']));
  expect(save).toHaveBeenCalledTimes(1);
  expect(writer.pending).toBe(true);
  expect(session.getSnapshot().document.advancedContent).toEqual(initialContent);
  act(() => writer.reset());
  expect(writer.pending).toBe(false);
});
