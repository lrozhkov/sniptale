// @vitest-environment jsdom
import { act, type PointerEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useReviewTimelinePlaneDrag } from './timeline-drag';

it('retains a complete source range when pointerup precedes note completion', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  let admit!: () => void;
  const seek = vi.fn();
  const select = vi.fn();
  const commit = vi.fn();
  const clear = vi.fn();
  let handlers!: ReturnType<typeof useReviewTimelinePlaneDrag>;
  function Harness() {
    handlers = useReviewTimelinePlaneDrag({
      duration: 10,
      time: 0,
      selection: { kind: 'point', time: 0 },
      beforeAction: (action) => {
        admit = action;
      },
      onSeek: seek,
      onSelect: select,
      onRangeCommit: commit,
      onClearSelection: clear,
    });
    return (
      <div ref={handlers.plane}>
        <div data-ui="gallery.videoReview.sourceLane" />
      </div>
    );
  }
  try {
    act(() => root.render(<Harness />));
    const plane = host.firstElementChild! as HTMLDivElement;
    Object.assign(plane, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => true,
      releasePointerCapture: vi.fn(),
      getBoundingClientRect: () => new DOMRect(0, 0, 100, 40),
    });
    const event = (x: number) =>
      ({
        button: 0,
        pointerId: 1,
        clientX: x,
        target: plane.firstElementChild,
        currentTarget: plane,
      }) as unknown as PointerEvent<HTMLDivElement>;
    act(() => {
      handlers.onPointerDown(event(20));
      handlers.onPointerMove(event(60));
      handlers.onPointerUp(event(60));
    });
    expect(seek).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    act(() => admit());
    expect(clear).toHaveBeenCalledOnce();
    expect(seek).toHaveBeenCalledWith(2);
    expect(select).toHaveBeenCalledWith({ kind: 'range', start: 2, end: 6 });
    expect(commit).toHaveBeenCalledWith({ kind: 'range', start: 2, end: 6 });
    act(() => {
      handlers.onPointerDown(event(20));
      handlers.onPointerMove(event(40));
      handlers.onPointerCancel();
      admit();
    });
    expect(commit).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
