// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewTimelineResizeGuide, useReviewResizeBoundary } from './timeline-resize-guide';

function Boundary(props: { gesture: object; time: number }) {
  useReviewResizeBoundary(props.gesture, props.time);
  return null;
}

it('preserves the current boundary through stale cleanup and scroll, then resets with its source', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const viewport = document.createElement('div');
  Object.defineProperty(viewport, 'clientWidth', { value: 600 });
  const root = createRoot(host);
  const first = {};
  const second = {};
  const render = (old: boolean, current: boolean, source = 'one') =>
    act(() =>
      root.render(
        <ReviewTimelineResizeGuide
          key={source}
          hover={null}
          viewport={{ current: viewport }}
          gutter={20}
          width={1000}
          duration={10}
        >
          {old ? <Boundary key="first" gesture={first} time={2} /> : null}
          {current ? <Boundary key="second" gesture={second} time={4} /> : null}
        </ReviewTimelineResizeGuide>
      )
    );
  const guide = () => host.querySelector<HTMLElement>('[data-resizing]');
  try {
    render(true, false);
    expect(guide()?.style.left).toBe('220px');
    render(true, true);
    expect(guide()?.style.left).toBe('420px');
    render(false, true);
    expect(guide()?.style.left).toBe('420px');
    act(() => {
      viewport.scrollLeft = 450;
      viewport.dispatchEvent(new Event('scroll'));
    });
    expect(guide()).toBeNull();
    act(() => {
      viewport.scrollLeft = 300;
      viewport.dispatchEvent(new Event('scroll'));
    });
    expect(guide()?.style.left).toBe('420px');
    render(false, false, 'two');
    expect(guide()).toBeNull();
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('updates the overlay without rendering unrelated track children', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const gesture = {};
  let renders = 0;
  function Track() {
    renders++;
    return <span>Track</span>;
  }
  function Gesture() {
    const [time, setTime] = useState(1);
    useReviewResizeBoundary(gesture, time);
    return <button onClick={() => setTime(2)}>Resize</button>;
  }
  try {
    act(() =>
      root.render(
        <ReviewTimelineResizeGuide
          hover={null}
          viewport={{ current: null }}
          gutter={0}
          width={1000}
          duration={10}
        >
          <Track />
          <Gesture />
        </ReviewTimelineResizeGuide>
      )
    );
    act(() => host.querySelector('button')!.click());
    expect(host.querySelector<HTMLElement>('[data-resizing]')?.style.left).toBe('200px');
    expect(renders).toBe(1);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
