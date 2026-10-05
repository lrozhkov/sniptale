// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { VideoReviewLoadError } from '../../workflows/video-review/source';
import { useLoadedReview } from './use-session';

const mocks = vi.hoisted(() => ({ load: vi.fn(), error: vi.fn() }));
vi.mock('../../workflows/video-review/source', async (original) => ({
  ...(await original<typeof import('../../workflows/video-review/source')>()),
  loadVideoReviewSource: mocks.load,
}));
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ error: mocks.error }),
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
  mocks.load.mockReset();
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
