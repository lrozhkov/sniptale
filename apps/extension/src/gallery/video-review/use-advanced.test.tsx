// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { QuickEditAdvancedState } from '../../features/video/review/advanced/types';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import { useReviewAdvanced } from './use-advanced';

let root: Root;
let host: HTMLDivElement;
let advanced: ReturnType<typeof useReviewAdvanced>;

function setup() {
  let workspaceAdvanced = createQuickEditAdvancedState();
  let revision = 1;
  const build = (): VideoWorkspaceSnapshot => ({
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 'asset',
      formatVersion: 1,
      source: { duration: 4, width: 320, height: 180, mimeType: 'video/webm', size: 200 },
      revision,
      cursor: 0,
      advanced: structuredClone(workspaceAdvanced),
      history: [],
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  });
  const deps = {
    saveVideoWorkspaceDraft: vi.fn(async () => build()),
    commitVideoWorkspace: vi.fn(async () => build()),
    readVideoWorkspace: vi.fn(async () => build()),
    moveVideoWorkspaceHistory: vi.fn(async () => build()),
    saveVideoWorkspaceAdvanced: vi.fn(async (args: { advanced: unknown }) => {
      workspaceAdvanced = structuredClone(args.advanced) as QuickEditAdvancedState;
      revision += 1;
      return build();
    }),
  } satisfies Parameters<typeof createVideoReviewSession>[1];
  const saveFromOtherTab = (next: QuickEditAdvancedState) => {
    workspaceAdvanced = structuredClone(next);
    revision += 1;
  };
  const session = createVideoReviewSession(build(), deps);
  function Harness() {
    advanced = useReviewAdvanced(session);
    return null;
  }
  act(() => root.render(<Harness />));
  return { session, deps, saveFromOtherTab, Harness };
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

it('rebuilds writes from reloaded persisted content after a conflict recovery', async () => {
  const { session, deps, saveFromOtherTab } = setup();
  deps.saveVideoWorkspaceAdvanced.mockRejectedValueOnce(new Error('Revision conflict'));
  act(() => advanced.setMode('advanced'));
  await act(async () => vi.advanceTimersByTimeAsync(250));
  expect(deps.saveVideoWorkspaceAdvanced).toHaveBeenCalledTimes(1);
  expect(advanced.advanced.ui.mode).toBe('advanced');

  // Another tab saved zoom content; the stale tab reloads to recover from the conflict.
  const otherTab = createQuickEditAdvancedState();
  otherTab.ui.mode = 'advanced';
  otherTab.zoom = {
    enabled: true,
    regions: [
      {
        id: 'zoom-b',
        start: 1,
        end: 2,
        transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
        enter: { type: 'ease-in-out', duration: 0.3 },
        exit: { type: 'ease-in-out', duration: 0.3 },
      },
    ],
  };
  saveFromOtherTab(otherTab);
  await act(async () => {
    await session.reload();
  });
  act(() => advanced.reset());

  expect(advanced.advanced.zoom.regions).toHaveLength(1);
  act(() => advanced.setMode('basic'));
  await act(async () => vi.advanceTimersByTimeAsync(250));
  const write = deps.saveVideoWorkspaceAdvanced.mock.lastCall?.[0] as {
    advanced: QuickEditAdvancedState;
  };
  expect(write.advanced.ui.mode).toBe('basic');
  expect(write.advanced.zoom.regions).toHaveLength(1);
});
