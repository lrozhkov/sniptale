import { DEFAULT_WINDOW_HEADER } from '../../features/browser-frame/header';
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useReviewWindowHeader } from './use-window-header';
import { loadReviewWindowHeader } from '../../workflows/video-review/window-header';

vi.mock('../../workflows/video-review/window-header', () => ({
  reviewWindowHeaderUrl: (header: { title: string; url?: string }) =>
    `${header.title}|${header.url ?? ''}`,
  loadReviewWindowHeader: vi.fn(),
}));

it('cancels obsolete titles, ignores late results and retries a failed decode', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const pending: {
    signal: AbortSignal;
    resolve(image: ImageBitmap): void;
    reject(error: Error): void;
  }[] = [];
  vi.mocked(loadReviewWindowHeader).mockImplementation(
    (_url, signal) => new Promise((resolve, reject) => pending.push({ signal, resolve, reject }))
  );
  const host = document.createElement('div'),
    root = createRoot(host);
  let result: ReturnType<typeof useReviewWindowHeader>;
  function Harness({ title, url = '' }: { title: string; url?: string }) {
    result = useReviewWindowHeader(
      { ...DEFAULT_WINDOW_HEADER, kind: 'browser' as const, title, url },
      1920,
      1080
    );
    return null;
  }
  try {
    await act(async () => root.render(<Harness title="first" />));
    await act(async () => root.render(<Harness title="first" url="https://site.test" />));
    expect(result!.url).toBe('first|https://site.test');
    expect(pending[0]!.signal.aborted).toBe(true);
    const stale = { width: 931, height: 86, close: vi.fn() },
      current = { width: 931, height: 86, close: vi.fn() };
    const retried = { width: 931, height: 86, close: vi.fn() };
    await act(async () => pending[0]!.resolve(stale));
    expect(result!.image).toBeNull();
    expect(stale.close).toHaveBeenCalledOnce();
    await act(async () => pending[1]!.resolve(current));
    expect(result!.image).toBe(current);
    await act(async () => root.render(<Harness title="third" />));
    expect(current.close).toHaveBeenCalledOnce();
    await act(async () => pending[2]!.reject(new Error('decode')));
    expect(result!.failed).toBe(true);
    await act(async () => result!.retry());
    expect(result!.failed).toBe(false);
    await act(async () => pending[3]!.resolve(retried));
    expect(result!.image).toBe(retried);
    await act(async () => root.render(null));
    expect(retried.close).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
  expect(pending.at(-1)!.signal.aborted).toBe(true);
});
