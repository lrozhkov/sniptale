// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { observeReviewRemovalMotion } from './timeline-removal-motion';

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function fixture(reduced = false) {
  const viewport = document.createElement('div');
  const lane = document.createElement('div');
  const plate = document.createElement('button');
  plate.setAttribute('data-review-removal-key', 'edit:one');
  plate.setAttribute('data-ui', 'gallery.videoReview.editBlock');
  plate.id = 'plate';
  lane.append(plate);
  viewport.append(lane);
  document.body.append(viewport);
  const animation = { cancel: vi.fn(), onfinish: null as (() => void) | null };
  const animate = vi.fn(() => animation);
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: reduced }))
  );
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
  const stop = observeReviewRemovalMotion(viewport);
  cleanups.push(stop, () => Reflect.deleteProperty(HTMLElement.prototype, 'animate'));
  return { viewport, lane, plate, animation, animate, stop };
}

it('removes the real plate immediately and finishes an inert140ms visual copy', async () => {
  const { plate, lane, animation, animate } = fixture();
  plate.remove();
  expect(plate.isConnected).toBe(false);
  await Promise.resolve();
  const copy = lane.querySelector<HTMLElement>('[data-review-removing]')!;
  expect(copy.inert).toBe(true);
  expect(copy.getAttribute('aria-hidden')).toBe('true');
  expect(copy.hasAttribute('data-review-removal-key')).toBe(false);
  expect(copy.hasAttribute('data-ui')).toBe(false);
  expect(copy.id).toBe('');
  expect(animate).toHaveBeenCalledWith(
    expect.any(Array),
    expect.objectContaining({ duration: 140 })
  );
  animation.onfinish!();
  expect(lane.children).toHaveLength(0);
});

it('cancels the outgoing visual when undo restores the same identity', async () => {
  const { plate, lane, animation } = fixture();
  plate.remove();
  await Promise.resolve();
  lane.append(plate);
  await Promise.resolve();
  expect(lane.children).toHaveLength(1);
  expect(lane.firstElementChild).toBe(plate);
  expect(animation.cancel).toHaveBeenCalledOnce();
});

it('does not animate hiding a whole track or moving a retained plate', async () => {
  const { plate, lane, viewport, animate } = fixture();
  plate.remove();
  lane.append(plate);
  await Promise.resolve();
  expect(animate).not.toHaveBeenCalled();
  lane.remove();
  await Promise.resolve();
  expect(viewport.children).toHaveLength(0);
  expect(animate).not.toHaveBeenCalled();
});

it('respects reduced motion and cleans up pending visuals on unmount', async () => {
  const reduced = fixture(true);
  reduced.plate.remove();
  await Promise.resolve();
  expect(reduced.animate).not.toHaveBeenCalled();
  const normal = fixture();
  normal.plate.remove();
  await Promise.resolve();
  normal.stop();
  expect(normal.lane.children).toHaveLength(0);
  expect(normal.animation.cancel).toHaveBeenCalledOnce();
});
