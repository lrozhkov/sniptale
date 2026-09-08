// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useTimelineClipReveal } from './reveal';
let root: Root;
let container: HTMLDivElement;
let pending: FrameRequestCallback | null;
const navigateTo = vi.fn();
const request = { clipId: 'far', serial: 1 };
function Harness({ command = request }: { command?: typeof request }) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const trackListRef = useRef<HTMLDivElement>(null);
  useTimelineClipReveal({
    request: command,
    clips: [{ id: 'far', startTime: 80, duration: 4 }],
    pixelsPerSecond: 100,
    viewportWidth: 1000,
    navigateTo,
    timelineRef,
    trackListRef,
  });
  return (
    <>
      <div ref={timelineRef}>
        <div data-project-timeline-clip="far" />
      </div>
      <div ref={trackListRef} />
    </>
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('CSS', { escape: (s: string) => s });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    pending = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    pending = null;
  });
  navigateTo.mockClear();
  pending = null;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it('centers a far clip then synchronizes the vertical rail after it is rendered', () => {
  act(() => root.render(<Harness />));
  expect(navigateTo).toHaveBeenCalledWith(77);
  const timeline = container.children[0] as HTMLDivElement;
  Object.defineProperty(timeline, 'clientHeight', { value: 200 });
  vi.spyOn(timeline.firstElementChild!, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 400, 400, 40)
  );
  act(() => pending?.(0));
  expect(timeline.scrollTop).toBe(320);
  expect(container.children[1]!.scrollTop).toBe(320);
});
it('repeats an explicit reveal of the same clip but ignores ordinary renders and missing clips', () => {
  act(() => root.render(<Harness />));
  act(() => root.render(<Harness />));
  expect(navigateTo).toHaveBeenCalledTimes(1);
  act(() => root.render(<Harness command={{ ...request, serial: 2 }} />));
  expect(navigateTo).toHaveBeenCalledTimes(2);
  act(() => root.render(<Harness command={{ clipId: 'missing', serial: 3 }} />));
  expect(navigateTo).toHaveBeenCalledTimes(2);
  expect(pending).toBeNull();
});
