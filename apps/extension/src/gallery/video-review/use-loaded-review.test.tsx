// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { VideoReviewLoadError } from '../../workflows/video-review/source';
import { useLoadedReview } from './use-session';

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  refresh: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  listener: null as
    | null
    | ((event: {
        type: 'library-changed';
        reason: 'update';
        assetIds: string[];
        timestamp: number;
      }) => void),
}));
vi.mock('../../features/media-hub/events', () => ({
  subscribeToMediaHubEvents: (listener: typeof mocks.listener) => {
    mocks.listener = listener;
    return () => {
      mocks.listener = null;
    };
  },
}));
vi.mock('../../workflows/video-review/source', async (original) => ({
  ...(await original<typeof import('../../workflows/video-review/source')>()),
  loadVideoReviewSource: mocks.load,
  refreshVideoReviewRecordingHistory: mocks.refresh,
}));
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ error: mocks.error, warn: mocks.warn }),
}));
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
let state: ReturnType<typeof useLoadedReview>;
function Harness() {
  state = useLoadedReview('private-record');
  return null;
}
const source = { duration: 4, width: 320, height: 180, mimeType: 'video/webm', size: 5 };
function loaded() {
  return {
    file: new File(['video'], 'private.webm'),
    source,
    filename: 'private.webm',
    telemetry: null,
    snapshot: {
      workspace: {
        aggregateId: 'private-record',
        sourceAssetId: 'private-asset',
        formatVersion: 1,
        source,
        revision: 1,
        cursor: 0,
        history: [],
        advanced: createQuickEditAdvancedState(),
        createdAt: 1,
        updatedAt: 1,
      },
      draft: null,
    },
  };
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.error.mockClear();
  mocks.warn.mockClear();
  mocks.load.mockReset();
  mocks.refresh.mockReset();
  mocks.load.mockResolvedValue(loaded());
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:private'), revokeObjectURL: vi.fn() });
  host = document.createElement('div');
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});
it('logs only fixed workspace fields, then clears failure on retry', async () => {
  mocks.load.mockRejectedValueOnce(
    new VideoReviewLoadError('workspace', 'invalid', {
      check: 'history-replay',
      reason: 'no-change',
      operationIndex: 2,
      target: 'advancedContent',
      cursor: 3,
      historyLength: 4,
    })
  );
  await act(async () => root.render(<Harness />));
  expect(state.failed).toMatchObject({ stage: 'workspace', reason: 'invalid' });
  expect(mocks.error).toHaveBeenCalledExactlyOnceWith('video-review-open-failed', {
    stage: 'workspace',
    reason: 'invalid',
    validation: {
      check: 'history-replay',
      reason: 'no-change',
      operationIndex: 2,
      target: 'advancedContent',
      cursor: 3,
      historyLength: 4,
    },
  });
  await act(async () => state.retry());
  expect(state.failed).toBeNull();
  expect(state.resource?.url).toBe('blob:private');
});
it('does not report a late failed load after unmount', async () => {
  let reject!: (value: unknown) => void;
  mocks.load.mockReturnValueOnce(
    new Promise((_resolve, fail) => {
      reject = fail;
    })
  );
  await act(async () => root.render(<Harness />));
  act(() => root.render(null));
  await act(async () => reject(new Error('private-filename and payload')));
  expect(mocks.error).not.toHaveBeenCalled();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it('classifies session initialization without allocating a media URL or logging contents', async () => {
  const value = loaded();
  value.snapshot.workspace.cursor = 1;
  mocks.load.mockResolvedValueOnce(value);
  await act(async () => root.render(<Harness />));
  expect(mocks.error).toHaveBeenCalledExactlyOnceWith('video-review-open-failed', {
    stage: 'session',
    reason: 'unknown',
  });
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it('reduces unexpected loader exceptions to a fixed reason', async () => {
  mocks.load.mockRejectedValueOnce(new Error('private-file SECRET_PAYLOAD'));
  await act(async () => root.render(<Harness />));
  expect(mocks.error).toHaveBeenCalledExactlyOnceWith('video-review-open-failed', {
    stage: 'source',
    reason: 'unknown',
  });
  expect(JSON.stringify(state.failed)).not.toContain('SECRET_PAYLOAD');
});

it('source owner disposes exactly once on actual unmount and never on a cancelled beforeunload event', async () => {
  await act(async () => root.render(<Harness />));
  const session = state.resource!.session;
  const dispose = vi.spyOn(session, 'dispose');
  window.addEventListener('beforeunload', (event) => event.preventDefault(), { once: true });
  expect(window.dispatchEvent(new Event('beforeunload', { cancelable: true }))).toBe(false);
  expect(dispose).not.toHaveBeenCalled();
  await act(async () => root.render(null));
  expect(dispose).toHaveBeenCalledOnce();
  expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:private');
});

it('reports cleanup failure using a fixed content-free summary', async () => {
  await act(async () => root.render(<Harness />));
  vi.spyOn(state.resource!.session, 'dispose').mockRejectedValueOnce(
    new Error('PRIVATE RESOURCE NAME')
  );
  await act(async () => root.render(null));
  expect(mocks.warn).toHaveBeenCalledExactlyOnceWith('video-review-resource-cleanup-deferred');
});

vi.mock('../../workflows/sync-transfer/editing-admission', () => ({
  ensureNativeEditingRootAvailable: vi.fn(async () => undefined),
}));

it('refreshes late history without replacing the session, media URL, or pending edits', async () => {
  mocks.load.mockResolvedValueOnce({
    ...loaded(),
    recordingHistorySource: {
      recordingId: 'r',
      assetId: 'private-asset',
      filename: 'private.webm',
    },
  });
  await act(async () => root.render(<Harness />));
  const initial = state.resource!;
  const dispose = vi.spyOn(initial.session, 'dispose');
  const capture = vi.fn(() => ({
    change: { kind: 'draft' as const, annotation: null, before: null },
    acknowledge: vi.fn(),
    fail: vi.fn(),
  }));
  initial.session.stageAutosave('draft', capture, { delay: 60_000, maxWait: 60_000 });
  const snapshot = initial.session.getSnapshot();
  expect(snapshot.dirty).toBe(true);
  const telemetry = { recordingId: 'r', actionEvents: [{ id: 'late-click' }] };
  mocks.refresh.mockResolvedValue({ telemetry, historyProject: null });
  await act(async () =>
    mocks.listener?.({
      type: 'library-changed',
      reason: 'update',
      assetIds: ['recording:other'],
      timestamp: 1,
    })
  );
  expect(mocks.refresh).not.toHaveBeenCalled();
  await act(async () =>
    mocks.listener?.({
      type: 'library-changed',
      reason: 'update',
      assetIds: ['recording:r'],
      timestamp: 2,
    })
  );
  expect(state.resource?.telemetry).toEqual(telemetry);
  expect(state.resource?.session).toBe(initial.session);
  expect(state.resource?.session.getSnapshot()).toBe(snapshot);
  expect(state.resource?.file).toBe(initial.file);
  expect(URL.createObjectURL).toHaveBeenCalledOnce();
  expect(dispose).not.toHaveBeenCalled();
  mocks.refresh.mockRejectedValueOnce(new Error('PRIVATE'));
  await act(async () =>
    mocks.listener?.({
      type: 'library-changed',
      reason: 'update',
      assetIds: ['recording:r'],
      timestamp: 3,
    })
  );
  expect(state.resource?.telemetry).toEqual(telemetry);
  expect(mocks.warn).toHaveBeenCalledWith('video-review-history-refresh-failed');
  expect(initial.session.getSnapshot().dirty).toBe(true);
  expect(capture).not.toHaveBeenCalled();
  initial.session.cancelAutosave('draft');
});

it('rejects a history refresh that finishes after the editor is disposed', async () => {
  mocks.load.mockResolvedValueOnce({
    ...loaded(),
    recordingHistorySource: {
      recordingId: 'r',
      assetId: 'private-asset',
      filename: 'private.webm',
    },
  });
  await act(async () => root.render(<Harness />));
  let resolve!: (value: unknown) => void;
  mocks.refresh.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    })
  );
  await act(async () =>
    mocks.listener?.({
      type: 'library-changed',
      reason: 'update',
      assetIds: ['recording:r'],
      timestamp: 1,
    })
  );
  const initial = state.resource;
  await act(async () => root.render(null));
  await act(async () => resolve({ telemetry: { recordingId: 'stale' }, historyProject: null }));
  expect(state.resource).toBe(initial);
});

it('observes publication while the initial source read is still pending', async () => {
  let resolve!: (value: unknown) => void;
  mocks.load.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    })
  );
  mocks.refresh.mockResolvedValue({ telemetry: { recordingId: 'r' }, historyProject: null });
  await act(async () => root.render(<Harness />));
  await act(async () =>
    mocks.listener?.({
      type: 'library-changed',
      reason: 'update',
      assetIds: ['recording:r'],
      timestamp: 1,
    })
  );
  expect(mocks.refresh).not.toHaveBeenCalled();
  await act(async () =>
    resolve({
      ...loaded(),
      recordingHistorySource: {
        recordingId: 'r',
        assetId: 'private-asset',
        filename: 'private.webm',
      },
    })
  );
  expect(state.resource?.telemetry).toEqual({ recordingId: 'r' });
});
