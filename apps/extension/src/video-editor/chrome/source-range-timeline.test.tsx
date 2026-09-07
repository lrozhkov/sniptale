// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SourceRangeTimeline } from './source-range-timeline';
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let plane: HTMLDivElement;
let captured = false;
const seek = vi.fn();
const commit = vi.fn();
function Subject({
  disabled = false,
  duration = 4,
  initialRange = { start: 1, end: 3 },
}: {
  disabled?: boolean;
  duration?: number;
  initialRange?: { start: number; end: number };
}) {
  const [range, setRange] = useState(initialRange);
  const [cursor, setCursor] = useState(1.5);
  return (
    <SourceRangeTimeline
      duration={duration}
      fps={30}
      range={range}
      cursor={cursor}
      disabled={disabled}
      onRange={(value) => {
        commit(value);
        setRange(value);
      }}
      onSeek={(value) => {
        seek(value);
        setCursor(value);
      }}
    />
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Subject />));
  plane = host.querySelector<HTMLDivElement>('[data-ui="video-editor.source-range"]')!;
  vi.spyOn(plane, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 70));
  plane.setPointerCapture = () => {
    captured = true;
  };
  plane.hasPointerCapture = () => captured;
  plane.releasePointerCapture = () => {
    captured = false;
  };
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  captured = false;
});
function pointer(type: string, x: number, target: Element = plane) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, button: 0 });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  act(() => target.dispatchEvent(event));
}
function range() {
  return { start: Number(plane.dataset['in']), end: Number(plane.dataset['out']) };
}
it('selects a reversed range directly on the lane and commits only on release', () => {
  pointer('pointerdown', 300);
  pointer('pointermove', 100);
  expect(range()).toEqual({ start: 1, end: 3 });
  expect(commit).not.toHaveBeenCalled();
  pointer('pointermove', 50);
  expect(range()).toEqual({ start: 0.5, end: 3 });
  pointer('pointerup', 50);
  expect(commit).toHaveBeenCalledExactlyOnceWith({ start: 0.5, end: 3 });
  expect(captured).toBe(false);
});
it('holds a trimmed edge at the source boundary and can move it back during the same drag', () => {
  const end = host.querySelector('[data-source-edge="end"]')!;
  pointer('pointerdown', 300, end);
  pointer('pointermove', 600);
  expect(range().end).toBe(4);
  expect(captured).toBe(true);
  pointer('pointermove', 250);
  expect(range().end).toBe(2.5);
  pointer('pointerup', 250);
  expect(commit).toHaveBeenCalledExactlyOnceWith({ start: 1, end: 2.5 });
});
it.each(['escape', 'pointercancel', 'lostpointercapture'])(
  'restores the cursor and marks on %s',
  (kind) => {
    pointer('pointerdown', 50);
    pointer('pointermove', 200);
    expect(range()).toEqual({ start: 0.5, end: 2 });
    if (kind === 'escape')
      act(() =>
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      );
    else pointer(kind, 200);
    expect(range()).toEqual({ start: 1, end: 3 });
    expect(commit).not.toHaveBeenCalled();
    expect(seek).toHaveBeenLastCalledWith(1.5);
    expect(captured).toBe(false);
  }
);
it('selects the same range from the ruler as from the lane, without a separate scrub mode', () => {
  pointer('pointerdown', 100, host.querySelector('[data-source-ruler]')!);
  pointer('pointermove', 200);
  pointer('pointerup', 200);
  expect(seek).toHaveBeenLastCalledWith(1);
  expect(commit).toHaveBeenCalledExactlyOnceWith({ start: 1, end: 2 });
  expect(range()).toEqual({ start: 1, end: 2 });
});
it('resizes edges by frame with keyboard and ignores all gestures while unavailable', () => {
  const end = host.querySelector('[data-source-edge="end"]')!;
  act(() => end.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
  expect(range().end).toBeCloseTo(3 - 1 / 30);
  commit.mockClear();
  act(() => root.render(<Subject disabled />));
  pointer('pointerdown', 100);
  pointer('pointermove', 300);
  pointer('pointerup', 300);
  expect(commit).not.toHaveBeenCalled();
  expect(captured).toBe(false);
});

it('spreads readable ruler marks across a long source instead of concentrating them at zero', () => {
  act(() => root.render(<Subject duration={10800} />));
  const ruler = host.querySelector('[data-source-ruler]')!;
  const ticks = [...ruler.querySelectorAll<HTMLElement>(':scope > span')];
  expect(ticks.length).toBeGreaterThan(1);
  expect(ticks.length).toBeLessThan(12);
  expect(Math.max(...ticks.map((tick) => Number.parseFloat(tick.style.left)))).toBeGreaterThan(70);
});

it('keeps fractional-duration keyboard boundaries on frames and preserves the exact terminal end', () => {
  act(() =>
    root.render(<Subject key="fractional" duration={4.01} initialRange={{ start: 0, end: 4.01 }} />)
  );
  plane = host.querySelector<HTMLDivElement>('[data-ui="video-editor.source-range"]')!;
  const end = plane.querySelector('[data-source-edge="end"]')!;
  act(() => end.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
  expect(range().end).toBe(4);
  act(() => end.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
  expect(range().end).toBe(4.01);
  act(() =>
    plane
      .querySelector('[data-source-edge="start"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
  );
  expect(range().start).toBeCloseTo(119 / 30);
  expect(range().end - range().start).toBeGreaterThanOrEqual(1 / 30);
});

it('selects the entire source with the range action and does not start a drag', () => {
  const all = host.querySelector<HTMLButtonElement>('[data-ui="video-editor.source-range.all"]')!;
  expect(all).not.toBeNull();
  act(() => all.click());
  expect(range()).toEqual({ start: 0, end: 4 });
  expect(captured).toBe(false);
  expect(all.disabled).toBe(true);
});
it('selects all with the local keyboard shortcut and keeps clicks independent from the range', () => {
  const ruler = host.querySelector('[data-source-ruler]')!;
  pointer('pointerdown', 350, ruler);
  pointer('pointerup', 350);
  expect(seek).toHaveBeenLastCalledWith(3.5);
  expect(commit).not.toHaveBeenCalled();
  act(() =>
    ruler.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }))
  );
  expect(range()).toEqual({ start: 0, end: 4 });
});
