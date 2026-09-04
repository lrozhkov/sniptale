// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useProjectTimelineSeek } from './seek';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('scrubs through pointer move while isolating the initiating event', () => {
  const onSeek = vi.fn();
  let beginScrub: ReturnType<typeof useProjectTimelineSeek>['beginPlayheadScrub'] | null = null;
  const state: {
    consumeClick?: ReturnType<typeof useProjectTimelineSeek>['consumeCompletedScrubClick'];
  } = {};
  function Harness() {
    const timelineRef = { current: container };
    const seek = useProjectTimelineSeek({
      onSeek,
      pixelsPerSecond: 60,
      projectDuration: 10,
      timelineRef,
    });
    beginScrub = seek.beginPlayheadScrub;
    state.consumeClick = seek.consumeCompletedScrubClick;
    return null;
  }
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    bottom: 30,
    height: 30,
    left: 0,
    right: 600,
    top: 0,
    width: 600,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  act(() => root.render(<Harness />));
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  const onComplete = vi.fn();

  act(() => {
    beginScrub?.({ clientX: 126, preventDefault, stopPropagation } as never, 2, onComplete);
    const move = new Event('pointermove');
    Object.defineProperty(move, 'clientX', { value: 606 });
    window.dispatchEvent(move);
    window.dispatchEvent(new Event('pointerup'));
  });

  expect(preventDefault).toHaveBeenCalledOnce();
  expect(stopPropagation).toHaveBeenCalledOnce();
  expect(onComplete).toHaveBeenCalledOnce();
  expect(onSeek.mock.calls).toEqual([[10]]);
  expect(state.consumeClick?.()).toBe(true);
  expect(state.consumeClick?.()).toBe(false);
});
