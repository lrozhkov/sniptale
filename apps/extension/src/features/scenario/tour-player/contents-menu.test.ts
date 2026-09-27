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

/** The drawer keeps the current slide visible and restores focus on commit or Escape. */
it('opens the slide drawer and selects or dismisses it predictably', async () => {
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

it('keeps clicks inside an editor shadow-root menu until the selected action runs', async () => {
  const { root } = await mount();
  const host = document.createElement('div');
  document.body.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.append(root);
  try {
    root.querySelector<HTMLButtonElement>('[data-tour-contents]')!.click();
    const navigation = root.querySelector<HTMLDialogElement>('[data-tour-navigation]')!;
    const second = navigation.querySelectorAll<HTMLButtonElement>('.tour-contents-list button')[1]!;
    second.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    expect(navigation.open).toBe(true);
    second.click();
    expect(root.dataset['slideId']).toBe('second');
    expect(navigation.open).toBe(false);
  } finally {
    document.body.append(root);
    host.remove();
  }
});

it('keeps keyboard focus within the drawer and restores its trigger on close', async () => {
  const { root } = await mount();
  const navigation = root.querySelector<HTMLDialogElement>('[data-tour-navigation]')!;
  const trigger = root.querySelector<HTMLButtonElement>('[data-tour-contents]')!;
  trigger.click();
  const buttons = [...navigation.querySelectorAll<HTMLButtonElement>('button')];
  expect(navigation.querySelector('h2')?.textContent).toBe(labels.contents);
  buttons.at(-1)!.focus();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }));
  expect(document.activeElement).toBe(buttons[0]);
  document.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      cancelable: true,
    })
  );
  expect(document.activeElement).toBe(buttons.at(-1));
  buttons[0]!.click();
  expect(navigation.open).toBe(false);
  expect(document.activeElement).toBe(trigger);
  trigger.click();
  trigger.click();
  expect(navigation.open).toBe(false);
});

it('releases drawer listeners when disposed while open', async () => {
  const { root, player } = await mount();
  root.querySelector<HTMLButtonElement>('[data-tour-contents]')!.click();
  player.dispose();
  const escape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
  document.dispatchEvent(escape);
  expect(escape.defaultPrevented).toBe(false);
  expect(root.querySelector<HTMLDialogElement>('[data-tour-navigation]')!.open).toBe(false);
});
