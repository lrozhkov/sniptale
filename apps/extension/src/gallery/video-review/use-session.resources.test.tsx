// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useLoadedReview } from './use-session';
const harness = vi.hoisted(() => ({
  acquire: vi.fn(),
  load: vi.fn(),
  dispose: vi.fn(),
  prepare: vi.fn(async (): Promise<void> => undefined),
}));
vi.mock('../../composition/persistence/assets/resource-sessions', () => ({
  acquireAssetResourceSession: harness.acquire,
}));
vi.mock('../../workflows/video-review/source', async (original) => ({
  ...(await original<typeof import('../../workflows/video-review/source')>()),
  loadVideoReviewSource: harness.load,
}));
vi.mock('../../workflows/video-review/session', () => ({
  createVideoReviewSession: () => ({ dispose: harness.dispose }),
}));
afterEach(() => vi.unstubAllGlobals());

it('acquires before loading and retains the lease until ordered session disposal drains', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let acquire!: (session: { release(): Promise<void> }) => void;
  let finishDispose!: () => void;
  const ready = new Promise<{ release(): Promise<void> }>((resolve) => {
    acquire = resolve;
  });
  const disposed = new Promise<void>((resolve) => {
    finishDispose = resolve;
  });
  const release = vi.fn(async () => undefined);
  harness.acquire.mockReturnValue(ready);
  harness.dispose.mockReturnValue(disposed);
  harness.load.mockResolvedValue({
    snapshot: {},
    file: new Blob(['source']),
    filename: 'source.webm',
  });
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:source', revokeObjectURL: vi.fn() });
  function Harness() {
    useLoadedReview('recording:source');
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Harness />));
  expect(harness.load).not.toHaveBeenCalled();
  await act(async () => {
    acquire({ release });
    await ready;
  });
  expect(harness.load).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
  expect(harness.dispose).toHaveBeenCalledOnce();
  expect(release).not.toHaveBeenCalled();
  await act(async () => {
    finishDispose();
    await disposed;
  });
  expect(release).toHaveBeenCalledOnce();
});

vi.mock('../../workflows/sync-transfer/editing-admission', () => ({
  ensureNativeEditingRootAvailable: harness.prepare,
}));

it('holds the preparation reader and discards a cancelled opening', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  harness.load.mockClear();
  let finish!: () => void;
  const prepared = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const release = vi.fn(async () => undefined);
  harness.acquire.mockResolvedValue({ release });
  harness.prepare.mockReturnValueOnce(prepared);
  const host = document.createElement('div');
  const root = createRoot(host);
  function Harness() {
    useLoadedReview('recording:r');
    return null;
  }
  await act(async () => root.render(<Harness />));
  expect(harness.prepare).toHaveBeenCalledWith({ rootKind: 'video-review', rootId: 'recording:r' });
  expect(harness.load).not.toHaveBeenCalled();
  await act(async () => root.unmount());
  expect(release).not.toHaveBeenCalled();
  await act(async () => {
    finish();
    await prepared;
  });
  expect(harness.load).not.toHaveBeenCalled();
  expect(release).toHaveBeenCalledOnce();
});
