// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useReviewWindowHeader } from './use-window-header';
import { loadReviewWindowHeader } from '../../workflows/video-review/window-header';

vi.mock('../../workflows/video-review/window-header', () => ({
  reviewWindowHeaderUrl: (header: { title: string }) => header.title,
  loadReviewWindowHeader: vi.fn(),
}));

it('cancels obsolete titles, ignores late results and retries a failed decode', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const pending: {
    signal: AbortSignal;
    resolve(image: HTMLImageElement): void;
    reject(error: Error): void;
  }[] = [];
  vi.mocked(loadReviewWindowHeader).mockImplementation(
    (_url, signal) => new Promise((resolve, reject) => pending.push({ signal, resolve, reject }))
  );
  const host = document.createElement('div'),
    root = createRoot(host);
  let result: ReturnType<typeof useReviewWindowHeader>;
  function Harness({ title }: { title: string }) {
    result = useReviewWindowHeader({ kind: 'browser', title }, 1920);
    return null;
  }
  try {
    await act(async () => root.render(<Harness title="first" />));
    await act(async () => root.render(<Harness title="second" />));
    expect(pending[0]!.signal.aborted).toBe(true);
    const stale = document.createElement('img'),
      current = document.createElement('img');
    await act(async () => pending[0]!.resolve(stale));
    expect(result!.image).toBeNull();
    await act(async () => pending[1]!.resolve(current));
    expect(result!.image).toBe(current);
    await act(async () => root.render(<Harness title="third" />));
    await act(async () => pending[2]!.reject(new Error('decode')));
    expect(result!.failed).toBe(true);
    await act(async () => result!.retry());
    expect(result!.failed).toBe(false);
    await act(async () => pending[3]!.resolve(current));
    expect(result!.image).toBe(current);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
  expect(pending.at(-1)!.signal.aborted).toBe(true);
});
