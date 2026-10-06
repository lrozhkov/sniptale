// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useVideoExportSizeEstimate } from './use-size-estimate';
import type { VideoExportSizeEstimate } from '../../features/video/project/export/size-estimate';
const value: VideoExportSizeEstimate = {
  bytes: 1000,
  lowerBytes: 750,
  upperBytes: 1350,
  sampledSeconds: 2,
};
let root: Root;
let node: HTMLDivElement;
let state: ReturnType<typeof useVideoExportSizeEstimate>;
const calculate = vi.fn<(signal: AbortSignal) => Promise<VideoExportSizeEstimate>>();
function Harness({ request }: { request: string | null }) {
  state = useVideoExportSizeEstimate(request, (signal) => calculate(signal));
  return null;
}
async function render(request: string | null) {
  await act(async () => root.render(<Harness request={request} />));
}
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
  calculate.mockReset().mockResolvedValue(value);
});
afterEach(() => {
  act(() => root.unmount());
  node.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('debounces rapid changes and computes only the latest profile', async () => {
  await render('A');
  await advance(700);
  await render('B');
  await advance(700);
  await render('C');
  await advance(999);
  expect(calculate).not.toHaveBeenCalled();
  expect(state.status?.kind).toBe('pending');
  await advance(1);
  expect(calculate).toHaveBeenCalledTimes(1);
  expect(state.status).toEqual({ kind: 'ready', estimate: value });
});
it('hides stale values, caches profiles and ignores callback identity changes', async () => {
  await render('A');
  await advance(1000);
  await render('A');
  expect(calculate).toHaveBeenCalledTimes(1);
  await render('B');
  expect(state.status?.kind).toBe('pending');
  await render('A');
  expect(state.status?.kind).toBe('ready');
  await advance(2000);
  expect(calculate).toHaveBeenCalledTimes(1);
});
it('aborts obsolete work, waits for cleanup and skips intermediate requests', async () => {
  let finish: ((value: VideoExportSizeEstimate) => void) | undefined;
  calculate.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await render('A');
  await advance(1000);
  const signal = calculate.mock.calls[0]![0];
  await render('B');
  expect(signal.aborted).toBe(true);
  await advance(1000);
  expect(calculate).toHaveBeenCalledTimes(1);
  await render('C');
  await advance(1000);
  expect(calculate).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish!(value);
  });
  expect(calculate).toHaveBeenCalledTimes(2);
  expect(state.status?.kind).toBe('ready');
});
it('rejects a stale completion even when the same key is selected again', async () => {
  let finish: ((value: VideoExportSizeEstimate) => void) | undefined;
  calculate.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await render('A');
  await advance(1000);
  await render('B');
  await render('A');
  await act(async () => {
    finish!({ ...value, bytes: 99 });
  });
  expect(state.status?.kind).toBe('pending');
  await advance(1000);
  expect(calculate).toHaveBeenCalledTimes(2);
  expect(state.status).toEqual({ kind: 'ready', estimate: value });
});
it('times out cooperatively without retry spam and restarts only for a new request', async () => {
  calculate.mockImplementationOnce(
    (signal) =>
      new Promise((_, reject) =>
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      )
  );
  await render('A');
  await advance(11000);
  expect(state.status?.kind).toBe('unavailable');
  await render('A');
  await advance(30000);
  expect(calculate).toHaveBeenCalledTimes(1);
  await render('B');
  await advance(1000);
  expect(state.status?.kind).toBe('ready');
});
it('cancels pending work on export and active work when the panel is hidden', async () => {
  await render('A');
  state.cancel();
  await advance(2000);
  expect(calculate).not.toHaveBeenCalled();
  calculate.mockImplementationOnce(
    (signal) =>
      new Promise((_, reject) =>
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      )
  );
  await render('B');
  await advance(1000);
  const signal = calculate.mock.calls[0]![0];
  await render(null);
  expect(signal.aborted).toBe(true);
  expect(state.status).toBeNull();
});
