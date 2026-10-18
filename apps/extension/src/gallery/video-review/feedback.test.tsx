// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewLoadStatus } from './feedback';
import { VideoReviewLoadError } from '../../workflows/video-review/source';

vi.mock('../../platform/i18n', () => ({ translate: (key: string) => key }));

it('shows only loading feedback until a failure makes recovery actions available', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const onBack = vi.fn(),
    onRetry = vi.fn();
  try {
    await act(async () =>
      root.render(<ReviewLoadStatus failure={null} onBack={onBack} onRetry={onRetry} />)
    );
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      'gallery.videoReview.loading'
    );
    expect(host.querySelectorAll('button')).toHaveLength(0);
    await act(async () =>
      root.render(
        <ReviewLoadStatus
          failure={new VideoReviewLoadError('workspace', 'storage')}
          onBack={onBack}
          onRetry={onRetry}
        />
      )
    );
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'gallery.videoReview.workspaceLoadFailed'
    );
    act(() =>
      host
        .querySelector<HTMLButtonElement>('button[aria-label="gallery.videoReview.back"]')!
        .click()
    );
    expect(onBack).toHaveBeenCalledOnce();
    act(() =>
      host
        .querySelector<HTMLButtonElement>('button[aria-label="gallery.videoReview.retry"]')!
        .click()
    );
    expect(onRetry).toHaveBeenCalledOnce();
    await act(async () =>
      root.render(
        <ReviewLoadStatus
          failure={new VideoReviewLoadError('source', 'unavailable')}
          onBack={onBack}
          onRetry={onRetry}
        />
      )
    );
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'gallery.videoReview.loadFailed'
    );
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
