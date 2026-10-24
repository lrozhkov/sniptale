// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useTimelineNavigation } from './navigation';
import { useProjectTimelinePlaybackFollow } from './playback-follow';

let root: Root;
let container: HTMLDivElement;
function Harness({ time = 0, playing = true, projectId = 'one', editing = false }) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const navigation = useTimelineNavigation({
    extentSeconds: 100,
    pixelsPerSecond: 100,
    viewportWidth: 1000,
    timelineRef,
  });
  useProjectTimelinePlaybackFollow({
    currentTime: time,
    isPlaying: playing,
    projectId,
    editing,
    pixelsPerSecond: 100,
    viewportWidth: 1000,
    timelineRef,
    navigateTo: navigation.navigateTo,
    readStartTime: navigation.readStartTime,
  });
  return (
    <div ref={timelineRef} data-start={navigation.projection.startTime}>
      <button>edit</button>
    </div>
  );
}
function render(props: Parameters<typeof Harness>[0] = {}) {
  act(() => root.render(<Harness {...props} />));
  return Number(container.firstElementChild?.getAttribute('data-start'));
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
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
it('pages at 95 percent and places playback at 10 percent; follows backward loops', () => {
  expect(render({ time: 9.49 })).toBe(0);
  expect(render({ time: 9.5 })).toBe(8.5);
  expect(render({ time: 10 })).toBe(8.5);
  expect(render({ time: 2 })).toBe(1);
});
it('preserves paused and editing viewports', () => {
  expect(render({ time: 20, playing: false })).toBe(0);
  expect(render({ time: 20, editing: true })).toBe(0);
});
it('manual horizontal scroll suspends follow until Play or a new project', () => {
  render();
  act(() => {
    const node = container.firstElementChild!;
    node.scrollLeft = 400;
    node.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  expect(render({ time: 30 })).toBe(4);
  render({ time: 30, playing: false });
  expect(render({ time: 30 })).toBe(29);
  act(() =>
    container.querySelector('button')!.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  );
  expect(render({ time: 60 })).toBe(29);
  expect(render({ time: 60, projectId: 'two' })).toBe(59);
});
it('acknowledges its own delayed scroll and keeps following', () => {
  render({ time: 10 });
  act(() => container.firstElementChild!.dispatchEvent(new Event('scroll', { bubbles: true })));
  expect(render({ time: 20 })).toBe(19);
});
it('horizontal wheel retains the user viewport through later playback ticks', () => {
  render();
  act(() =>
    container.firstElementChild!.dispatchEvent(
      new WheelEvent('wheel', { deltaX: 100, bubbles: true, cancelable: true })
    )
  );
  expect(render({ time: 30 })).toBe(1);
});
it('keyboard editing suspends follow, but Tab navigation does not', () => {
  render();
  act(() =>
    container
      .querySelector('button')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
  );
  expect(render({ time: 20 })).toBe(19);
  act(() =>
    container
      .querySelector('button')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  );
  expect(render({ time: 40 })).toBe(19);
});
it('does not navigate a hidden document', () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  expect(render({ time: 30 })).toBe(0);
});
