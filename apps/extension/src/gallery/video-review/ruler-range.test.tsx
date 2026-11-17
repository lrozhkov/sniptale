// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useReviewRulerRange, ReviewPlaybackRangeOverlay } from './ruler-range';
import { ReviewRuler } from './timeline-chrome';

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
function mount(
  overrides: Partial<Parameters<typeof useReviewRulerRange>[0]> = {},
  interactive = false
) {
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
        <ReviewPlaybackRangeOverlay
          range={owner.range}
          duration={10}
          gutter={120}
          width={1000}
          edgeInteraction={interactive ? owner.edgeInteraction : undefined}
        />
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
  Object.assign(host, { getBoundingClientRect: () => new DOMRect(-20, 0, 1120, 400) });
  for (const edge of host.querySelectorAll('[data-playback-range-edge]'))
    Object.assign(edge, {
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
  expect(overlay.querySelector('[data-range-edge]')).toBeNull();

  act(() => root.render(<ReviewRuler duration={10} width={1000} range={{ start: 1, end: 1.1 }} />));
  const labels = [...host.querySelectorAll<HTMLElement>('[data-range-edge]')];
  expect(labels).toHaveLength(2);
  expect(labels.every((node) => node.style.visibility === 'hidden')).toBe(true);
});

it.each(['start', 'end'] as const)(
  'pauses immediately and resizes the %s edge without seeking during movement',
  (edge) => {
    const onPause = vi.fn();
    const onHoverIntent = vi.fn();
    const { options, owner } = mount({ range: { start: 2, end: 6 }, onPause, onHoverIntent }, true);
    const handle = host.querySelector<HTMLElement>(`[data-playback-range-edge="${edge}"]`)!;
    const geometry = vi.spyOn(host, 'getBoundingClientRect');
    const x = edge === 'start' ? 300 : 700;
    pointer(handle, 'pointerdown', x);
    expect(handle.dataset['resizing']).toBe('true');
    expect(onPause).toHaveBeenCalledOnce();
    expect(onHoverIntent).toHaveBeenLastCalledWith(true);
    pointer(handle, 'pointermove', x + 100);
    expect(handle.dataset['resizing']).toBe('true');
    expect(owner().range).toEqual(edge === 'start' ? { start: 3, end: 6 } : { start: 2, end: 7 });
    expect(options.onSeek).not.toHaveBeenCalled();
    expect(options.onChange).not.toHaveBeenCalled();
    pointer(handle, 'pointerup', x + 100);
    expect(handle.dataset['resizing']).toBeUndefined();
    expect(document.activeElement).not.toBe(handle);
    expect(geometry).toHaveBeenCalledOnce();
    expect(options.onChange).toHaveBeenCalledExactlyOnceWith(
      edge === 'start' ? { start: 3, end: 6 } : { start: 2, end: 7 }
    );
    expect(onHoverIntent).toHaveBeenLastCalledWith(false);
  }
);

it.each(['pointercancel', 'lostpointercapture', 'Escape', 'blur'])(
  'restores the interval after edge resize cancellation by %s',
  (cancel) => {
    const onPause = vi.fn();
    const onHoverIntent = vi.fn();
    const { options, owner } = mount({ onPause, onHoverIntent }, true);
    const handle = host.querySelector<HTMLElement>('[data-playback-range-edge="end"]')!;
    pointer(handle, 'pointerdown', 300);
    pointer(handle, 'pointermove', 500);
    if (cancel === 'Escape') key(handle, 'keydown', 'Escape');
    else if (cancel === 'blur') act(() => window.dispatchEvent(new Event('blur')));
    else pointer(handle, cancel, 500);
    pointer(handle, 'pointerup', 500);
    expect(owner().range).toEqual(options.range);
    expect(handle.dataset['resizing']).toBeUndefined();
    expect(options.onChange).not.toHaveBeenCalled();
    expect(options.onSeek).not.toHaveBeenCalled();
    expect(onPause).toHaveBeenCalledOnce();
    expect(onHoverIntent).toHaveBeenLastCalledWith(false);
  }
);

it('clamps edges without swapping, keeps a minimum interval and supports keyboard resize', () => {
  const { options, owner } = mount({ range: { start: 2, end: 6 }, onPause: vi.fn() }, true);
  const start = host.querySelector<HTMLElement>('[data-playback-range-edge="start"]')!;
  pointer(start, 'pointerdown', 300);
  pointer(start, 'pointermove', 900);
  expect(owner().range!.start).toBeCloseTo(5.95);
  expect(owner().range!.end).toBe(6);
  pointer(start, 'pointercancel', 900);
  pointer(start, 'pointerdown', 300);
  pointer(start, 'pointermove', -100);
  expect(owner().range).toEqual({ start: 0, end: 6 });
  pointer(start, 'pointerup', -100);
  key(start, 'keydown', 'ArrowRight');
  expect(options.onChange).toHaveBeenLastCalledWith({ start: 2.1, end: 6 });
});

it('paints the selected interval and its edge times inside the sticky ruler', () => {
  const geometry = { duration: 10, width: 1000, range: { start: 2, end: 6 } };
  act(() => root.render(<ReviewRuler {...geometry} />));
  const ruler = host.querySelector('[data-ui="gallery.videoReview.ruler"]')!;
  const selection = ruler.querySelector<HTMLElement>(
    '[data-ui="gallery.videoReview.rulerRangeOverlay"]'
  )!;
  expect(selection).not.toBeNull();
  expect(selection.style.left).toBe('200px');
  expect(selection.style.width).toBe('400px');
  expect(ruler.firstElementChild).toBe(selection);
  const labels = [...selection.querySelectorAll<HTMLElement>('[data-range-edge]')];
  expect(labels).toHaveLength(2);
  expect(labels.every((label) => label.style.visibility === 'visible')).toBe(true);
  expect(selection.querySelector('[role="slider"]')).toBeNull();
});
