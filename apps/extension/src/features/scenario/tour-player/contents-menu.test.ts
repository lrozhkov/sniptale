// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTourDocument, createTourImageSlide } from '../project/factories';
import { buildTourPlayerHtml } from './document';
import { createTourPlayer } from './controller';

const labels = {
  expand: 'Expand explanation',
  collapse: 'Collapse explanation',
  previous: 'Back',
  next: 'Next',
  contents: 'Contents',
  close: 'Close',
  restart: 'Restart',
  finished: 'Finished',
  empty: 'Empty',
  point: 'Point',
  details: 'Details',
  play: 'Play',
  pause: 'Pause',
  seek: 'Playback position',
  retry: 'Retry',
  loading: 'Loading',
  mediaError: 'Image failed',
  choose: 'Choose a destination',
};
const mounted: { player: ReturnType<typeof createTourPlayer>; root: HTMLElement }[] = [];
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
});
afterEach(() => {
  mounted.splice(0).forEach(({ player, root }) => {
    player.dispose();
    root.remove();
  });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount() {
  const tour = createTourDocument('tour');
  tour.slides = [createTourImageSlide('first'), createTourImageSlide('second')];
  tour.slides[0]!.title = 'First';
  tour.slides[1]!.title = 'Second';
  const html = await buildTourPlayerHtml({ tour, title: 'Tour', labels, assets: [] });
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const root = parsed.getElementById('tour-player');
  if (!root) throw new Error('Missing player fixture');
  document.body.append(root);
  const player = createTourPlayer(root, { tour, labels, assets: [] });
  const value = { player, root };
  mounted.push(value);
  return value;
}

/** The contents menu opens non-modal, anchored to the trigger, with the current slide visible. */
it('opens the contents menu as a non-modal list anchored to its trigger', async () => {
  const { player, root } = await mount();
  const navigation = root.querySelector<HTMLDialogElement>('[data-tour-navigation]')!;
  const trigger = root.querySelector<HTMLButtonElement>('[data-tour-contents]')!;
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  trigger.click();
  expect(navigation.open).toBe(true);
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  const items = [...navigation.querySelectorAll<HTMLButtonElement>('.tour-contents-list button')];
  expect(items).toHaveLength(2);
  expect(items[0]!.getAttribute('aria-current')).toBe('step');
  expect(items.map((item) => item.textContent)).toEqual(['1. First', '2. Second']);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
  expect(navigation.open).toBe(false);
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(trigger);
  trigger.click();
  expect(navigation.open).toBe(true);
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  expect(navigation.open).toBe(false);
  trigger.click();
  items[1]!.focus();
  items[1]!.click();
  expect(root.dataset['slideId']).toBe('second');
  expect(navigation.open).toBe(false);
  expect(document.activeElement).toBe(trigger);
  void player;
});
