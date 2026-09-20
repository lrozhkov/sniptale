// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { QuickEditAdvancedState } from '../../features/video/review/advanced/types';
import type { ReviewOperation } from '../../features/video/review/types';
import { parseReviewOperation } from '../../features/video/review/validation';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import { useReviewAdvanced } from './use-advanced';

let root: Root;
let host: HTMLDivElement;
let advanced: ReturnType<typeof useReviewAdvanced>;

function setup() {
  let workspaceAdvanced = createQuickEditAdvancedState();
  let revision = 1;
  let history: ReviewOperation[] = [];
  const build = (): VideoWorkspaceSnapshot => ({
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 'asset',
      formatVersion: 1,
      source: { duration: 4, width: 320, height: 180, mimeType: 'video/webm', size: 200 },
      revision,
      cursor: history.length,
      advanced: structuredClone(workspaceAdvanced),
      history: [...history],
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  });
  const deps = {
    saveVideoWorkspaceDraft: vi.fn(async () => build()),
    commitVideoWorkspace: vi.fn(async (args: { operation: unknown }) => {
      const operation = parseReviewOperation(args.operation, 4);
      if (!operation) throw new Error('Operation is invalid.');
      history = [...history, operation];
      revision += 1;
      return build();
    }),
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
  return { session, deps, saveFromOtherTab, build };
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

it('composes two commands staged before the next render (S1)', async () => {
  const { deps } = setup();
  act(() => {
    advanced.setMode('advanced');
    advanced.setTrackVisibility('zoom', true);
  });
  expect(advanced.advanced.ui.mode).toBe('advanced');
  expect(advanced.advanced.ui.tracks.zoom).toBe(true);
  await act(async () => vi.advanceTimersByTimeAsync(250));
  expect(deps.saveVideoWorkspaceAdvanced).toHaveBeenCalledTimes(1);
  const write = deps.saveVideoWorkspaceAdvanced.mock.lastCall?.[0] as {
    advanced: QuickEditAdvancedState;
  };
  expect(write.advanced.ui.mode).toBe('advanced');
  expect(write.advanced.ui.tracks.zoom).toBe(true);
});

it('stages ui commands through the whole-state writer and content through history ops', async () => {
  const { deps, session } = setup();
  act(() => advanced.setZoom((zoom) => ({ ...zoom, enabled: true })));
  act(() =>
    advanced.setBackground((background) => ({
      ...background,
      enabled: true,
      type: 'solid',
      color: '#111111ff',
      layout: { padding: 12, cornerRadius: 4 },
    }))
  );
  expect(advanced.advanced.zoom.enabled).toBe(true);
  expect(advanced.advanced.background.enabled).toBe(true);
  await act(async () => vi.advanceTimersByTimeAsync(250));
  // One collapsed content operation; the whole-state writer stays untouched.
  expect(deps.commitVideoWorkspace).toHaveBeenCalledTimes(1);
  const op = deps.commitVideoWorkspace.mock.lastCall?.[0].operation as {
    target: string;
    after: { zoom: { enabled: boolean }; background: { enabled: boolean } };
  };
  expect(op.target).toBe('advancedContent');
  expect(op.after.zoom.enabled).toBe(true);
  expect(op.after.background.enabled).toBe(true);
  expect(deps.saveVideoWorkspaceAdvanced).not.toHaveBeenCalled();
  act(() => session.getSnapshot());
});

it('keeps the newest local revision when an older write acknowledges (S2)', async () => {
  const { deps, build } = setup();
  let releaseA!: () => void;
  deps.commitVideoWorkspace.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        releaseA = () => resolve(build() as never);
      })
  );
  act(() => advanced.setZoom((zoom) => ({ ...zoom, enabled: true })));
  await act(async () => vi.advanceTimersByTimeAsync(250));
  act(() =>
    advanced.setBackground((background) => ({
      ...background,
      enabled: true,
      type: 'solid',
      color: '#111111ff',
      layout: { padding: 12, cornerRadius: 4 },
    }))
  );
  await act(async () => {
    releaseA();
    await Promise.resolve();
  });
  expect(advanced.advanced.background.enabled).toBe(true);
  await act(async () => vi.advanceTimersByTimeAsync(250));
  expect(deps.commitVideoWorkspace).toHaveBeenCalledTimes(2);
  const op = deps.commitVideoWorkspace.mock.lastCall?.[0].operation as {
    after: { zoom: { enabled: boolean }; background: { enabled: boolean } };
  };
  expect(op.after.zoom.enabled).toBe(true);
  expect(op.after.background.enabled).toBe(true);
});

it('keeps the pending edit after a save failure, rejects flush, and retries (S3)', async () => {
  const { deps } = setup();
  deps.saveVideoWorkspaceAdvanced
    .mockRejectedValueOnce(new Error('storage'))
    .mockRejectedValueOnce(new Error('storage'));
  act(() => advanced.setMode('advanced'));
  await act(async () => vi.advanceTimersByTimeAsync(250));
  expect(advanced.saveFailed).toBe(true);
  expect(advanced.advanced.ui.mode).toBe('advanced');
  await expect(advanced.flush()).rejects.toThrow();
  expect(deps.saveVideoWorkspaceAdvanced).toHaveBeenCalledTimes(2);
  expect(advanced.advanced.ui.mode).toBe('advanced');
  await act(async () => advanced.retry());
  expect(advanced.saveFailed).toBe(false);
  expect(advanced.advanced.ui.mode).toBe('advanced');
  const write = deps.saveVideoWorkspaceAdvanced.mock.lastCall?.[0] as {
    advanced: QuickEditAdvancedState;
  };
  expect(write.advanced.ui.mode).toBe('advanced');
});

it('persists canvas and lane gains through content history and clears an override back to native', async () => {
  const { session, deps, build } = setup();
  act(() => {
    advanced.setCanvas({ width: 1080, height: 1920 });
    advanced.setAudio((audio) => ({ ...audio, laneVolumes: { voiceover: 0.7, music: 0.2 } }));
  });
  await act(async () => advanced.flush());
  expect(session.getSnapshot().document.advancedContent).toMatchObject({
    canvas: { width: 1080, height: 1920 },
    audio: { laneVolumes: { voiceover: 0.7, music: 0.2 } },
  });
  const reopened = createVideoReviewSession(build(), deps);
  expect(reopened.getSnapshot().document.advancedContent.canvas).toEqual({
    width: 1080,
    height: 1920,
  });
  act(() => advanced.setCanvas(undefined));
  await act(async () => advanced.flush());
  expect(advanced.advanced.canvas).toBeUndefined();
  expect(session.getSnapshot().document.advancedContent.canvas).toBeUndefined();
  expect(session.getSnapshot().document.advancedContent.audio.laneVolumes?.music).toBe(0.2);
});
