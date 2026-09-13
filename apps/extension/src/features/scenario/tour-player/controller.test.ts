// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createTourDocument, createTourImageSlide } from '../project/factories';
import { buildTourPlayerHtml } from './document';
import { createTourPlayer } from './controller';

const labels = {
  previous: 'Back',
  next: 'Next',
  contents: 'Contents',
  close: 'Close',
  restart: 'Restart',
  finished: 'Finished',
  empty: 'Empty',
  point: 'Point',
  details: 'Details',
};
const mounted: { player: ReturnType<typeof createTourPlayer>; root: HTMLElement }[] = [];
afterEach(() => {
  mounted.splice(0).forEach(({ player, root }) => {
    player.dispose();
    root.remove();
  });
  vi.unstubAllGlobals();
});

async function mount() {
  const tour = createTourDocument('tour');
  tour.slides = [createTourImageSlide('first'), createTourImageSlide('second')];
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

it('selects stable slide identities without recording artificial back history', async () => {
  const { player, root } = await mount();
  player.select('second');
  expect(root.dataset['slideId']).toBe('second');
  player.select('missing');
  expect(root.dataset['slideId']).toBe('second');
  root.querySelector<HTMLButtonElement>('[data-tour-previous]')!.click();
  expect(root.dataset['slideId']).toBe('first');
});

it('disposes keyboard, transport and resize activity before remounting the same root', async () => {
  const { player, root } = await mount();
  const next = root.querySelector<HTMLButtonElement>('[data-tour-next]')!;
  player.dispose();
  next.click();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  window.dispatchEvent(new Event('resize'));
  player.select('second');
  expect(root.dataset['slideId']).toBe('first');
  expect(root.querySelector('[data-tour-scene]')!.children).toHaveLength(0);
  player.dispose();
  const tour = createTourDocument('remount');
  tour.slides = [createTourImageSlide('first'), createTourImageSlide('second')];
  const replacement = createTourPlayer(root, { tour, labels, assets: [] });
  mounted.push({ player: replacement, root });
  next.click();
  expect(root.dataset['slideId']).toBe('second');
  const rendered = root.querySelector('[data-tour-scene]')!.firstElementChild;
  player.dispose();
  expect(root.querySelector('[data-tour-scene]')!.firstElementChild).toBe(rendered);
  replacement.dispose();
});

it('disconnects the observer and ignores an already queued resize callback', async () => {
  let notify: (() => void) | undefined;
  const disconnect = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        notify = callback;
      }
      observe() {}
      disconnect = disconnect;
    }
  );
  const { player, root } = await mount();
  player.dispose();
  if (!notify) throw new Error('Observer not installed');
  notify();
  expect(disconnect).toHaveBeenCalledOnce();
  expect(root.querySelector('[data-tour-scene]')!.children).toHaveLength(0);
});
