// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { REVIEW_TRACK_ORDER, useReviewTrackOrder } from './track-order';

let root: Root;
let host: HTMLDivElement;
function Harness({ active = true }: { active?: boolean }) {
  const order = useReviewTrackOrder(active);
  return (
    <section data-ui="gallery.videoReview.dialog">
      <div data-ui="gallery.videoReview.trackListViewport">
        {order.order.map((track) => (
          <div key={track} data-review-header-track={track}>
            <button type="button" {...order.interaction(track)}>
              {track}
            </button>
            <button
              type="button"
              data-pin={track}
              aria-pressed={order.pinned.has(track)}
              onClick={() => order.togglePin(track)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    const nodes = [...this.parentElement!.children];
    return { y: nodes.indexOf(this) * 32, height: 32 } as DOMRect;
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const order = () =>
  [...host.querySelectorAll('[data-review-header-track]')].map((node) =>
    node.getAttribute('data-review-header-track')
  );
function pointer(node: Element, type: string, y: number) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientY: y });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  node.dispatchEvent(event);
}
it('moves only the view order with keyboard while retaining each mounted row', async () => {
  expect(order()).toEqual(REVIEW_TRACK_ORDER);
  const node = host.querySelector<HTMLButtonElement>('[data-review-header-track="music"] button')!;
  await act(async () =>
    node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
  );
  expect(order().slice(0, 2)).toEqual(['source', 'music']);
  expect(host.querySelector('[data-review-header-track="music"] button')).toBe(node);
  await act(async () =>
    node.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  );
  expect(order().slice(0, 3)).toEqual(['source', 'keyboard', 'music']);
});
it('moves tracks to the group boundary on pin and unpin', async () => {
  const pin = (track: string) => host.querySelector<HTMLButtonElement>(`[data-pin="${track}"]`)!;
  expect(pin('source').getAttribute('aria-pressed')).toBe('true');
  expect(pin('music').getAttribute('aria-pressed')).toBe('false');
  await act(async () => pin('music').click());
  expect(order().slice(0, 3)).toEqual(['source', 'music', 'keyboard']);
  await act(async () => pin('source').click());
  expect(order().slice(0, 3)).toEqual(['music', 'source', 'keyboard']);
  await act(async () => pin('music').click());
  expect(order().slice(0, 3)).toEqual(['music', 'source', 'keyboard']);
});

it('reorders with pointer and keyboard without crossing the pin boundary', async () => {
  await act(async () => host.querySelector<HTMLButtonElement>('[data-pin="mouse"]')!.click());
  const handle = (track: string) =>
    host.querySelector<HTMLButtonElement>(`[data-review-header-track="${track}"] button`)!;
  const press = (track: string, key: string) =>
    act(async () =>
      handle(track).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    );
  await act(async () => pointer(handle('mouse'), 'pointerdown', 48));
  await act(async () => pointer(handle('mouse'), 'pointermove', 80));
  expect(order().slice(0, 3)).toEqual(['source', 'mouse', 'keyboard']);
  await act(async () => pointer(handle('mouse'), 'pointermove', 16));
  await act(async () => pointer(handle('mouse'), 'pointerup', 16));
  expect(order().slice(0, 3)).toEqual(['mouse', 'source', 'keyboard']);
  await press('source', 'End');
  await press('keyboard', 'ArrowUp');
  expect(order().slice(0, 3)).toEqual(['mouse', 'source', 'keyboard']);
  await press('source', 'Home');
  expect(order().slice(0, 3)).toEqual(['source', 'mouse', 'keyboard']);
  await act(async () => pointer(handle('keyboard'), 'pointerdown', 80));
  await act(async () => pointer(handle('keyboard'), 'pointermove', 16));
  await act(async () => pointer(handle('keyboard'), 'pointerup', 16));
  expect(order().slice(0, 3)).toEqual(['source', 'mouse', 'keyboard']);
});
it.each(['Escape', 'blur', 'pointercancel'])(
  'previews pointer order and restores it on %s',
  async (cancel) => {
    const node = host.querySelector<HTMLButtonElement>(
      '[data-review-header-track="keyboard"] button'
    )!;
    await act(async () => pointer(node, 'pointerdown', 48));
    expect(host.querySelector('.review-track-reordering')).not.toBeNull();
    await act(async () => pointer(node, 'pointermove', 112));
    expect(order().slice(0, 4)).toEqual(['source', 'mouse', 'webcam', 'keyboard']);
    await act(async () => {
      if (cancel === 'Escape')
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      else if (cancel === 'blur') window.dispatchEvent(new Event('blur'));
      else pointer(node, 'pointercancel', 112);
    });
    expect(order()).toEqual(REVIEW_TRACK_ORDER);
    expect(host.querySelector('.review-track-reordering')).toBeNull();
  }
);
it('retains accepted pointer order after release and ignores later lost capture', async () => {
  const node = host.querySelector<HTMLButtonElement>(
    '[data-review-header-track="keyboard"] button'
  )!;
  await act(async () => pointer(node, 'pointerdown', 48));
  await act(async () => pointer(node, 'pointermove', 112));
  await act(async () => pointer(node, 'pointerup', 112));
  await act(async () => pointer(node, 'lostpointercapture', 112));
  expect(order().slice(0, 4)).toEqual(['source', 'mouse', 'webcam', 'keyboard']);
});

it('keeps the pointer gesture through a portal DOM move and cancels when settings close', async () => {
  const node = host.querySelector<HTMLButtonElement>(
    '[data-review-header-track="keyboard"] button'
  )!;
  await act(async () => pointer(node, 'pointerdown', 48));
  await act(async () => pointer(node, 'pointermove', 112));
  await act(async () => pointer(node, 'lostpointercapture', 112));
  await act(async () => pointer(node, 'pointermove', 48));
  expect(order().slice(0, 2)).toEqual(['source', 'keyboard']);
  await act(async () => root.render(<Harness active={false} />));
  expect(order()).toEqual(REVIEW_TRACK_ORDER);
});

it('clears the cursor owner when an active reorder unmounts', async () => {
  const node = host.querySelector<HTMLButtonElement>('[data-review-header-track="source"] button')!;
  await act(async () => pointer(node, 'pointerdown', 48));
  const surface = node.closest('[data-ui="gallery.videoReview.dialog"]')!;
  expect(surface.classList.contains('review-track-reordering')).toBe(true);
  await act(async () => root.render(null));
  expect(surface.classList.contains('review-track-reordering')).toBe(false);
});
