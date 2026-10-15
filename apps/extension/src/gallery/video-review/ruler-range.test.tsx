// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useReviewRulerRange, ReviewPlaybackRangeOverlay } from './ruler-range';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function mount(overrides: Partial<Parameters<typeof useReviewRulerRange>[0]> = {}) {
  const options = {
    duration: 10,
    time: 3,
    range: { start: 1, end: 2 },
    navigation: { start: 0.5, end: 9 },
    onSeek: vi.fn(),
    onChange: vi.fn(),
    ...overrides,
  };
  let owner!: ReturnType<typeof useReviewRulerRange>;
  function Harness() {
    owner = useReviewRulerRange(options);
    return (
      <>
        <div data-ruler {...owner.interaction} />
        <ReviewPlaybackRangeOverlay range={owner.range} duration={10} gutter={120} width={1000} />
      </>
    );
  }
  act(() => root.render(<Harness />));
  const ruler = host.querySelector<HTMLDivElement>('[data-ruler]')!;
  Object.assign(ruler, {
    getBoundingClientRect: () => new DOMRect(100, 0, 1000, 28),
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  });
  return {
    options,
    ruler,
    owner: () => owner,
    rerender: () => act(() => root.render(<Harness />)),
  };
}
function pointer(ruler: HTMLElement, type: string, x: number, button = 0) {
  act(() => ruler.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, button })));
}
function key(ruler: HTMLElement, type: string, value: string, shiftKey = false) {
  const event = new KeyboardEvent(type, { key: value, shiftKey, bubbles: true, cancelable: true });
  act(() => ruler.dispatchEvent(event));
  return event;
}
it('replaces a loop from either direction without seeking during draft; short clicks seek unsnapped', () => {
  const { ruler, options, owner } = mount();
  pointer(ruler, 'pointerdown', 800);
  pointer(ruler, 'pointermove', 400);
  expect(owner().range).toEqual({ start: 3, end: 7 });
  expect(options.onSeek).not.toHaveBeenCalled();
  expect(options.onChange).not.toHaveBeenCalled();
  pointer(ruler, 'pointerup', 400);
  expect(options.onChange).toHaveBeenLastCalledWith({ start: 3, end: 7 });
  pointer(ruler, 'pointerdown', 600);
  pointer(ruler, 'pointermove', 601);
  pointer(ruler, 'pointerup', 601);
  expect(options.onSeek).toHaveBeenLastCalledWith(5, false);
  expect(options.onChange).toHaveBeenCalledOnce();
});
it.each(['pointercancel', 'lostpointercapture', 'Escape'])(
  'restores prior range after %s and leaves transport untouched',
  (cancel) => {
    const { ruler, options, owner } = mount();
    pointer(ruler, 'pointerdown', 400);
    pointer(ruler, 'pointermove', 800);
    if (cancel === 'Escape') key(ruler, 'keydown', 'Escape');
    else pointer(ruler, cancel, 800);
    pointer(ruler, 'pointerup', 800);
    expect(owner().range).toEqual(options.range);
    expect(options.onChange).not.toHaveBeenCalled();
    expect(options.onSeek).not.toHaveBeenCalled();
  }
);
it('cancels a completed but note-blocked gesture on replacement, Escape and unmount', () => {
  const pending: (() => void)[] = [];
  const { ruler, options } = mount({ beforeAction: (action) => pending.push(action) });
  const drag = () => {
    pointer(ruler, 'pointerdown', 400);
    pointer(ruler, 'pointermove', 800);
    pointer(ruler, 'pointerup', 800);
  };
  drag();
  drag();
  act(() => pending[0]!());
  expect(options.onChange).not.toHaveBeenCalled();
  key(ruler, 'keydown', 'Escape');
  act(() => pending[1]!());
  expect(options.onChange).not.toHaveBeenCalled();
  drag();
  act(() => root.unmount());
  act(() => pending[2]!());
  expect(options.onChange).not.toHaveBeenCalled();
  root = createRoot(host);
});
it('commits admitted note continuation once and clears only the loop', () => {
  let admit!: () => void;
  const { ruler, options, owner } = mount({
    beforeAction: (action) => {
      admit = action;
    },
  });
  pointer(ruler, 'pointerdown', 400);
  pointer(ruler, 'pointermove', 800);
  pointer(ruler, 'pointerup', 800);
  act(() => {
    admit();
    admit();
  });
  expect(options.onChange).toHaveBeenCalledExactlyOnceWith({ start: 3, end: 7 });
  act(() => owner().clear());
  act(() => admit());
  expect(options.onChange).toHaveBeenLastCalledWith(null);
  expect(options.onSeek).not.toHaveBeenCalled();
});
it('keeps keyboard anchor through reversal and suppresses the window shortcut', () => {
  const { ruler, options } = mount();
  const global = vi.fn();
  window.addEventListener('keydown', global);
  try {
    key(ruler, 'keydown', 'ArrowRight', true);
    key(ruler, 'keydown', 'ArrowLeft', true);
    key(ruler, 'keydown', 'ArrowLeft', true);
    key(ruler, 'keyup', 'Shift');
    expect(options.onChange).toHaveBeenLastCalledWith({ start: 2.9, end: 3 });
    expect(global).not.toHaveBeenCalled();
    key(ruler, 'keydown', 'Home');
    expect(options.onSeek).toHaveBeenLastCalledWith(0.5, false);
    key(ruler, 'keydown', 'End');
    expect(options.onSeek).toHaveBeenLastCalledWith(9, false);
    key(ruler, 'keydown', 'ArrowRight');
    expect(options.onSeek).toHaveBeenLastCalledWith(3.1, false);
  } finally {
    window.removeEventListener('keydown', global);
  }
});
it('cancels keyboard drafts on blur or zero span and admits Enter; busy gestures do nothing', () => {
  const { ruler, options, rerender } = mount({ busy: false });
  key(ruler, 'keydown', 'ArrowRight', true);
  act(() => ruler.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  key(ruler, 'keyup', 'Shift');
  expect(options.onChange).not.toHaveBeenCalled();
  key(ruler, 'keydown', 'ArrowRight', true);
  key(ruler, 'keydown', 'ArrowLeft', true);
  key(ruler, 'keyup', 'Shift');
  expect(options.onChange).not.toHaveBeenCalled();
  key(ruler, 'keydown', 'ArrowRight', true);
  key(ruler, 'keydown', 'Enter');
  expect(options.onChange).toHaveBeenCalledOnce();
  options.busy = true;
  rerender();
  pointer(ruler, 'pointerdown', 400);
  pointer(ruler, 'pointermove', 800);
  pointer(ruler, 'pointerup', 800);
  key(ruler, 'keydown', 'ArrowLeft', true);
  key(ruler, 'keyup', 'Shift');
  expect(options.onChange).toHaveBeenCalledOnce();
});
it('draws a full-height noninteractive interval with aligned boundaries and hides colliding captions', () => {
  mount({ range: { start: 1, end: 1.1 } });
  const overlay = host.querySelector<HTMLElement>(
    '[data-ui="gallery.videoReview.playbackRangeOverlay"]'
  )!;
  expect(overlay.style.left).toBe('220px');
  expect(parseFloat(overlay.style.width)).toBeCloseTo(10);
  expect(overlay.className).toContain('top-0 bottom-2');
  expect(overlay.className).toContain('pointer-events-none');
  expect(
    [...overlay.querySelectorAll<HTMLElement>('[data-range-edge]')].every(
      (node) => node.style.visibility === 'hidden'
    )
  ).toBe(true);
});
