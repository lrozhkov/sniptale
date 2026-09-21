// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTourDocument, createTourImageSlide } from '../project/factories';
import { buildTourPlayerHtml } from './document';
import { createTourPlayer } from './controller';

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
  vi.useRealTimers();
});

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
async function mount() {
  const tour = createTourDocument('tour');
  const timing = createTourImageSlide('unused').timing;
  tour.slides = [
    {
      kind: 'navigation',
      id: 'first',
      title: 'First',
      description: '',
      background: { color: '#111827', image: null },
      buttons: [{ id: 'begin', label: 'Begin', action: { kind: 'end' } }],
      narration: null,
      timing,
    },
    {
      kind: 'navigation',
      id: 'second',
      title: 'Second',
      description: '',
      background: { color: '#111827', image: null },
      buttons: [],
      narration: null,
      timing,
    },
  ];
  const html = await buildTourPlayerHtml({ tour, title: 'Tour', labels, assets: [] });
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const root = parsed.getElementById('tour-player');
  if (!root) throw new Error('Missing player fixture');
  document.body.append(root);
  const player = createTourPlayer(root, { tour, labels, assets: [] });
  const value = { player, root, tour };
  mounted.push(value);
  return value;
}

/** Chrome hides only during active ready playback and returns on any user activity. */
it('auto-hides overlay chrome during playback and restores it on activity and pause', async () => {
  vi.useFakeTimers();
  let id = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (token: number) => frames.delete(token));
  const tick = async (delta: number) => {
    for (const callback of [...frames.values()].splice(0)) callback(performance.now() + delta);
    frames.clear();
    await Promise.resolve();
  };
  const { root } = await mount();
  await tick(0);
  root.querySelector<HTMLButtonElement>('[data-tour-play]')!.click();
  await tick(0);
  expect(root.dataset['tourPlaying']).toBe('true');
  expect(root.dataset['tourChromeHidden']).toBe('false');
  vi.advanceTimersByTime(2000);
  expect(root.dataset['tourChromeHidden']).toBe('true');
  root.dispatchEvent(new Event('pointermove'));
  expect(root.dataset['tourChromeHidden']).toBe('false');
  vi.advanceTimersByTime(2000);
  expect(root.dataset['tourChromeHidden']).toBe('true');
  root.querySelector<HTMLButtonElement>('[data-tour-play]')!.click();
  expect(root.dataset['tourPlaying']).toBe('false');
  expect(root.dataset['tourChromeHidden']).toBe('false');
  vi.advanceTimersByTime(5000);
  expect(root.dataset['tourChromeHidden']).toBe('false');
  root.querySelector<HTMLButtonElement>('[data-tour-play]')!.click();
  root.querySelector<HTMLButtonElement>('[data-tour-contents]')!.click();
  expect(root.dataset['tourChromeHidden']).toBe('false');
  vi.advanceTimersByTime(3000);
  expect(root.dataset['tourChromeHidden']).toBe('false');
  await tick(0);
});
