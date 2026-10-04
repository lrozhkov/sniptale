// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createTourDocument, createTourImageSlide } from '../project/factories';
import { buildTourPlayerHtml } from './document';
import { createTourPlayer } from './controller';

const labels = {
  expand: 'Expand',
  collapse: 'Collapse',
  previous: 'Previous',
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
  seek: 'Seek',
  retry: 'Retry',
  loading: 'Loading',
  mediaError: 'Image failed',
  choose: 'Choose',
  narrationReplay: 'Replay narration',
  narrationPause: 'Pause narration',
  narrationResume: 'Resume narration',
  volume: 'Volume',
  mute: 'Mute',
  unmute: 'Unmute',
};
const mounted: { root: HTMLElement; player: ReturnType<typeof createTourPlayer> }[] = [];
afterEach(() => {
  mounted.splice(0).forEach(({ root, player }) => {
    player.dispose();
    root.remove();
  });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function mediaClock() {
  let now = 0;
  let id = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const paused = new WeakMap<HTMLMediaElement, boolean>();
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  vi.stubGlobal(
    'Image',
    class {
      onload: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
      decode() {
        return Promise.resolve();
      }
    }
  );
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (key: number) => frames.delete(key));
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(
    function (this: HTMLMediaElement) {
      return paused.get(this) ?? true;
    }
  );
  const play = vi
    .spyOn(HTMLMediaElement.prototype, 'play')
    .mockImplementation(async function (this: HTMLMediaElement) {
      paused.set(this, false);
      this.dispatchEvent(new Event('playing'));
    });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(
    function (this: HTMLMediaElement) {
      paused.set(this, true);
      this.dispatchEvent(new Event('pause'));
    }
  );
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  return {
    play,
    async tick(delta = 0) {
      now += delta;
      const queued = [...frames.values()];
      frames.clear();
      queued.forEach((callback) => callback(now));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}
async function mount(autoplay = false) {
  const clock = mediaClock();
  const tour = createTourDocument('audio-controls');
  tour.playback.autoplay = autoplay;
  tour.transition = { kind: 'none', durationMs: 0, hotspotTravelMs: 0 };
  const first = createTourImageSlide('first');
  first.image = {
    assetId: 'image',
    galleryAssetId: null,
    editDocumentId: null,
    width: 400,
    height: 200,
    alt: '',
    source: { kind: 'import', filename: 'test.png' },
  };
  const narration = {
    assetId: 'voice',
    duration: 8,
    trimStart: 2,
    trimEnd: 4,
    gain: 0.5,
    transcript: '',
  };
  first.annotations = [
    {
      id: 'entry',
      text: 'Entry voice',
      anchor: null,
      appearance: null,
      narration: { ...narration, trigger: 'enter' },
    },
    {
      id: 'activation',
      text: 'Activation voice',
      anchor: null,
      appearance: null,
      narration: { ...narration, trimStart: 4, trimEnd: 6, trigger: 'activation' },
    },
    { id: 'silent', text: 'Silent', anchor: null, appearance: null },
  ];
  tour.slides = [first, createTourImageSlide('second')];
  const assets = [
    { id: 'image', mime: 'image/png', base64: 'AA==' },
    { id: 'voice', mime: 'audio/wav', base64: 'AA==' },
  ];
  const html = await buildTourPlayerHtml({ tour, title: 'Audio', labels, assets });
  const root = new DOMParser().parseFromString(html, 'text/html').getElementById('tour-player')!;
  document.body.append(root);
  const input = {
    tour,
    labels,
    assets: assets.map((asset) => ({
      id: asset.id,
      src: `data:${asset.mime};base64,${asset.base64}`,
    })),
  };
  const player = createTourPlayer(root, input);
  mounted.push({ root, player });
  await clock.tick();
  await clock.tick();
  const button = (selector: string) => {
    const value = root.querySelector<HTMLButtonElement>(selector);
    expect(value, selector).not.toBeNull();
    return value!;
  };
  return { root, player, tour, input, ...clock, button, media: root.querySelector('audio')! };
}
it('locally pauses and resumes entry narration without moving clock, slide or playback mode', async () => {
  const h = await mount(true);
  expect(h.media.paused).toBe(false);
  h.media.currentTime = 2.7;
  const toggle = h.button('[data-tour-narration-toggle="entry"]');
  toggle.click();
  expect(h.media.paused).toBe(true);
  expect(h.media.currentTime).toBe(2.7);
  expect(toggle.getAttribute('aria-label')).toBe(labels.narrationResume);
  const elapsed = h.root.querySelector<HTMLInputElement>('[data-tour-seek]')!.value;
  await h.tick(10000);
  expect(h.root.dataset['slideId']).toBe('first');
  expect(h.root.dataset['tourMode']).toBe('playback');
  expect(h.root.querySelector<HTMLInputElement>('[data-tour-seek]')!.value).toBe(elapsed);
  toggle.click();
  await h.tick();
  expect(h.media.paused).toBe(false);
  expect(h.media.currentTime).toBe(2.7);
  h.button('[data-tour-narration-replay="entry"]').click();
  await h.tick();
  expect(h.media.currentTime).toBe(2);
  expect(h.root.querySelectorAll('audio:not([data-tour-music])')).toHaveLength(1);
});
it('composes viewer volume and mute without restarting narration or changing authored gain', async () => {
  const h = await mount();
  h.button('[data-tour-narration-replay="entry"]').click();
  await h.tick();
  h.media.currentTime = 2.8;
  const plays = h.play.mock.calls.length;
  const range = h.root.querySelector<HTMLInputElement>('[data-tour-volume]');
  expect(range).not.toBeNull();
  range!.value = '0.4';
  range!.dispatchEvent(new Event('input', { bubbles: true }));
  expect(h.media.volume).toBeCloseTo(0.2);
  h.button('[data-tour-mute]').click();
  expect(h.media.volume).toBe(0);
  h.button('[data-tour-mute]').click();
  expect(h.media.volume).toBeCloseTo(0.2);
  expect(h.media.currentTime).toBe(2.8);
  expect(h.play).toHaveBeenCalledTimes(plays);
  expect(
    h.tour.slides[0]!.kind === 'image' && h.tour.slides[0]!.annotations[0]!.narration!.gain
  ).toBe(0.5);
});

it('projects a newly selected hint identity without a media event and hides controls for silent points', async () => {
  const h = await mount();
  h.button('[data-tour-narration-replay="entry"]').click();
  await h.tick();
  h.button('[data-tour-hint-next]').click();
  const activation = h.button('[data-tour-narration-toggle="activation"]');
  expect(activation.getAttribute('aria-label')).toBe(labels.narrationReplay);
  activation.click();
  await h.tick();
  expect(h.media.currentTime).toBe(4);
  expect(activation.getAttribute('aria-label')).toBe(labels.narrationPause);
  h.button('[data-tour-hint-next]').click();
  expect(h.root.querySelector<HTMLElement>('[data-tour-narration-controls]')!.hidden).toBe(true);
  expect(h.root.dataset['slideId']).toBe('first');
});
it('resyncs global Play once and stops local audio on full view and navigation', async () => {
  const h = await mount(true);
  await h.tick(300);
  h.button('[data-tour-narration-replay="entry"]').click();
  await h.tick();
  h.media.currentTime = 3.1;
  const plays = h.play.mock.calls.length;
  h.button('[data-tour-play]').click();
  await h.tick();
  expect(h.play).toHaveBeenCalledTimes(plays + 1);
  expect(h.media.currentTime).toBeCloseTo(2.3);
  h.button('[data-tour-full-view]').click();
  expect(h.media.paused).toBe(true);
  expect(h.root.dataset['tourMode']).toBe('playback');
  h.button('[data-tour-narration-replay="entry"]').click();
  await h.tick();
  expect(h.media.paused).toBe(false);
  h.player.select('second');
  await h.tick();
  expect(h.media.paused).toBe(true);
  expect(h.media.getAttribute('src')).toBeNull();
  expect(h.root.querySelector<HTMLElement>('[data-tour-audio-controls]')!.hidden).toBe(false);
});
it('retries blocked narration by local gesture without advancing and preserves native Space admission', async () => {
  const h = await mount();
  h.play.mockRejectedValueOnce(new DOMException('Gesture required', 'NotAllowedError'));
  h.button('[data-tour-narration-replay="entry"]').click();
  await h.tick();
  expect(h.media.paused).toBe(true);
  expect(
    h.root.querySelector<HTMLElement>('[data-tour-narration-controls]')!.dataset[
      'tourNarrationStatus'
    ]
  ).toBe('blocked');
  const control = h.button('[data-tour-narration-toggle="entry"]');
  const key = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
  control.dispatchEvent(key);
  expect(key.defaultPrevented).toBe(false);
  const attempts = h.play.mock.calls.length;
  control.click();
  await h.tick();
  expect(h.play).toHaveBeenCalledTimes(attempts + 1);
  expect(h.media.paused).toBe(false);
  await h.tick(10000);
  expect(h.root.dataset['slideId']).toBe('first');
  expect(h.root.dataset['tourMode']).toBe('manual');
});
it('refreshes actual recreated navigation controls from retained audio state after resize', async () => {
  const h = await mount();
  const first = h.tour.slides[0]!;
  if (first.kind !== 'image') throw new Error('Expected image fixture');
  const narration = first.annotations[1]!.narration!;
  h.tour.slides[0] = {
    kind: 'navigation',
    id: 'first',
    title: 'Navigation',
    description: '',
    background: { color: '#000000', image: null },
    narration: null,
    timing: first.timing,
    buttons: [{ id: 'jump', label: 'Stay', action: { kind: 'none' }, narration }],
  };
  h.player.update(h.input);
  await h.tick();
  const oldControl = h.button('[data-tour-narration-toggle="jump"]');
  oldControl.click();
  await h.tick();
  h.media.currentTime = 4.6;
  oldControl.click();
  expect(h.media.paused).toBe(true);
  Object.defineProperty(h.root, 'clientWidth', { configurable: true, value: 1000 });
  Object.defineProperty(h.root, 'clientHeight', { configurable: true, value: 800 });
  globalThis.dispatchEvent(new Event('resize'));
  const recreated = h.button('[data-tour-narration-toggle="jump"]');
  expect(recreated).not.toBe(oldControl);
  expect(recreated.getAttribute('aria-label')).toBe(labels.narrationResume);
  recreated.click();
  await h.tick();
  expect(h.media.currentTime).toBe(4.6);
  expect(h.media.paused).toBe(false);
});
it('does not show viewer volume for detached unused audio resources', async () => {
  const h = await mount();
  h.tour.slides = [createTourImageSlide('first')];
  h.tour.audioResources = [{ assetId: 'voice', name: 'Unused', duration: 8 }];
  h.player.update(h.input);
  await h.tick();
  expect(h.root.querySelector<HTMLElement>('[data-tour-audio-controls]')!.hidden).toBe(true);
});
