// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewTimeline } from './timeline';
vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

it('keeps original time coordinates through zoom and preserves separate comment navigation', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  const host = document.createElement('div');
  const root = createRoot(host);
  const onSelect = vi.fn();
  const onSeek = vi.fn();
  const onMarker = vi.fn();
  const onComment = vi.fn();
  const annotation = { id: 'a', text: 'Comment', anchor: { kind: 'point' as const, time: 2 } };
  const marker = {
    ref: { kind: 'action' as const, id: 'click' },
    eventType: 'CLICK',
    start: 1,
    end: 1.1,
  };
  try {
    act(() =>
      root.render(
        <ReviewTimeline
          duration={4}
          time={2}
          playing={false}
          selection={{ kind: 'point', time: 2 }}
          annotations={[annotation]}
          markers={[marker]}
          onSeek={onSeek}
          onSelect={onSelect}
          onPlay={vi.fn()}
          onMarker={onMarker}
          onComment={onComment}
        />
      )
    );
    expect(host.querySelector('[aria-label="gallery.videoReview.point"]')).toBeNull();
    expect(host.querySelector('input[type="number"]')).toBeNull();
    act(() =>
      host.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.zoomIn"]')!.click()
    );
    expect(
      host
        .querySelector('[aria-label="gallery.videoReview.position"]')
        ?.getAttribute('aria-valuemax')
    ).toBe('4');
    const plane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.timePlane"]')!;
    vi.spyOn(plane, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 80));
    Object.assign(plane, { setPointerCapture: vi.fn() });
    act(() =>
      host
        .querySelector('[data-ui="gallery.videoReview.ruler"]')!
        .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 300 }))
    );
    expect(onSeek).toHaveBeenCalledWith(3);
    expect(onSelect).toHaveBeenCalledWith({ kind: 'point', time: 3 });
    act(() =>
      host
        .querySelector<HTMLButtonElement>('[title="gallery.videoReview.eventClick · 1.0"]')!
        .click()
    );
    expect(onMarker).toHaveBeenCalledWith(marker);
    act(() => host.querySelector<HTMLButtonElement>('[title="Comment"]')!.click());
    expect(onComment).toHaveBeenCalledWith(annotation);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
