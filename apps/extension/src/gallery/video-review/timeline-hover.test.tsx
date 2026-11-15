// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useReviewTimelineHover } from './timeline-hover';

it('previews time on ruler, objects and empty lanes but clears for gutter, drag and leave', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'),
    root = createRoot(host),
    preview = vi.fn();
  function Harness({ busy = false }: { busy?: boolean }) {
    const hover = useReviewTimelineHover({
      onPreview: preview,
      busy,
      duration: 10,
      gutter: 100,
      width: 1000,
      zoom: 1,
      focusEnabled: false,
      originalEnabled: false,
      sourceRangeTool: false,
      snapRangePreview: false,
      boundaries: undefined,
    });
    return (
      <div data-plane onPointerMove={hover.move} onPointerLeave={hover.clear}>
        <div data-ui="gallery.videoReview.ruler" />
        <div data-ui="gallery.videoReview.editBlock">
          <button>speed</button>
        </div>
        <div role="button">annotation</div>
        <div data-ui="gallery.videoReview.webcamTrack" />
        <div data-gap />
      </div>
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    const plane = host.querySelector<HTMLDivElement>('[data-plane]')!;
    const rect = vi
      .spyOn(plane, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(0, 0, 1100, 400));
    const move = async (target: Element, x: number, buttons = 0) =>
      act(async () => {
        target.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: x, buttons }));
      });
    for (const selector of [
      '[data-ui="gallery.videoReview.ruler"]',
      'button',
      '[role="button"]',
      '[data-ui="gallery.videoReview.webcamTrack"]',
      '[data-gap]',
    ]) {
      await move(host.querySelector(selector)!, 600);
      expect(preview).toHaveBeenLastCalledWith(5);
    }
    await move(plane, 600, 1);
    expect(preview).toHaveBeenLastCalledWith(null);
    await move(plane, 50);
    expect(preview).toHaveBeenLastCalledWith(null);
    await move(plane, 600);
    await act(async () =>
      plane.dispatchEvent(
        new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body })
      )
    );
    expect(preview).toHaveBeenLastCalledWith(null);
    await act(async () => root.render(<Harness busy />));
    expect(preview).toHaveBeenLastCalledWith(null);
    await move(plane, 600);
    expect(preview).toHaveBeenLastCalledWith(null);
    rect.mockRestore();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
