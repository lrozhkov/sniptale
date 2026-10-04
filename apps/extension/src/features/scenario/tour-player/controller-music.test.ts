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
  const ramps: number[] = [];
  vi.stubGlobal(
    'AudioContext',
    class {
      destination = {};
      get currentTime() {
        return now / 1000;
      }
      createGain() {
        const gain = {
          value: 1,
          setValueAtTime(value: number) {
            gain.value = value;
          },
          cancelAndHoldAtTime: vi.fn(),
          linearRampToValueAtTime(value: number) {
            ramps.push(value);
            gain.value = value;
          },
        };
        return { gain, connect: vi.fn(), disconnect: vi.fn() };
      }
      createMediaElementSource() {
        return { connect: vi.fn(), disconnect: vi.fn() };
      }
      resume() {
        return Promise.resolve();
      }
      close() {
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
    ramps,
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
async function mount(endEnabled = true) {
  const clock = mediaClock();
  const tour = createTourDocument('music');
  tour.endScreen.enabled = endEnabled;
  tour.transition = { kind: 'none', durationMs: 0, hotspotTravelMs: 0 };
  tour.backgroundMusic = {
    assetId: 'music',
    duration: 30,
    volume: 0.4,
    loop: true,
    ducking: { enabled: true, level: 0.25 },
  };
  tour.slides = ['first', 'second', 'third'].map((id) => {
    const slide = createTourImageSlide(id);
    slide.timing = { ...slide.timing, mode: 'manual', holdSeconds: 0.1 };
    return slide;
  });
  const html = await buildTourPlayerHtml({
    tour: { ...tour, backgroundMusic: null },
    title: 'Music',
    labels,
    assets: [],
  });
  const root = new DOMParser().parseFromString(html, 'text/html').getElementById('tour-player')!;
  document.body.append(root);
  const input = { tour, labels, assets: [{ id: 'music', src: 'data:audio/wav;base64,AA==' }] };
  const player = createTourPlayer(root, input);
  mounted.push({ root, player });
  await clock.tick();
  const music = root.querySelector<HTMLAudioElement>('audio[data-tour-music]');
  expect(music).not.toBeNull();
  const click = (name: string) =>
    root.querySelector<HTMLButtonElement>(`[data-tour-${name}]`)!.click();
  return { ...clock, root, player, tour, input, music: music!, click };
}
it('admits a manual visit only through viewer navigation and preserves one music offset across slides', async () => {
  const h = await mount();
  expect(h.music.paused).toBe(true);
  h.player.select('second');
  await h.tick();
  expect(h.music.paused).toBe(true);
  h.click('previous');
  await h.tick();
  expect(h.music.paused).toBe(false);
  h.music.currentTime = 7;
  const plays = h.play.mock.calls.length;
  h.click('next');
  await h.tick();
  expect(h.music.currentTime).toBe(7);
  expect(h.play).toHaveBeenCalledTimes(plays);
  expect(h.root.dataset['tourMode']).toBe('manual');
  h.click('contents');
  await h.tick();
  expect(h.music.paused).toBe(false);
});
it('keeps explicitly paused music paused through navigation and resumes by global Play', async () => {
  const h = await mount();
  h.click('play');
  await h.tick();
  h.music.currentTime = 5;
  h.click('play');
  expect(h.music.paused).toBe(true);
  h.click('next');
  await h.tick();
  expect(h.music.paused).toBe(true);
  expect(h.music.currentTime).toBe(5);
  h.click('play');
  await h.tick();
  expect(h.music.paused).toBe(false);
  expect(h.music.currentTime).toBe(5);
});
it('finishes at the technical end and starts a fresh visit on a human Back command', async () => {
  const h = await mount();
  h.click('next');
  await h.tick();
  h.music.currentTime = 9;
  h.click('next');
  await h.tick();
  h.click('next');
  await h.tick();
  expect(h.root.dataset['slideId']).toBe('end');
  expect(h.music.paused).toBe(true);
  expect(h.music.currentTime).toBe(0);
  h.click('previous');
  await h.tick();
  expect(h.music.paused).toBe(false);
  expect(h.root.dataset['slideId']).toBe('third');
});
it('keeps automatic progression and choice waits independent from music visit activity', async () => {
  const h = await mount();
  h.click('play');
  await h.tick();
  h.music.currentTime = 6;
  await h.tick(100);
  expect(h.root.dataset['slideId']).toBe('second');
  expect(h.music.currentTime).toBe(6);
  expect(h.music.paused).toBe(false);
  h.tour.slides[1]!.timing = { ...h.tour.slides[1]!.timing, autoplayTarget: 'second' };
  h.player.update(h.input);
  await h.tick();
  h.click('play');
  await h.tick(100);
  expect(h.music.paused).toBe(false);
  expect(h.root.dataset['slideId']).toBe('second');
});
it('restarts completed tours without an end screen and preserves manual final reading', async () => {
  const h = await mount(false);
  h.click('next');
  await h.tick();
  h.click('next');
  await h.tick();
  h.music.currentTime = 8;
  await h.tick(10000);
  expect(h.music.paused).toBe(false);
  h.click('play');
  await h.tick(100);
  expect(h.music.paused).toBe(true);
  expect(h.music.currentTime).toBe(0);
  h.click('play');
  await h.tick();
  expect(h.root.dataset['slideId']).toBe('first');
  expect(h.music.paused).toBe(false);
});
it('pauses on hidden state without visibility auto-resume and never unlocks replacement on update', async () => {
  const h = await mount();
  h.click('next');
  await h.tick();
  h.music.currentTime = 5;
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  document.dispatchEvent(new Event('visibilitychange'));
  expect(h.music.paused).toBe(true);
  hidden.mockReturnValue(false);
  document.dispatchEvent(new Event('visibilitychange'));
  h.click('next');
  await h.tick();
  expect(h.music.paused).toBe(true);
  h.click('play');
  await h.tick();
  expect(h.music.currentTime).toBe(5);
  h.tour.backgroundMusic = { ...h.tour.backgroundMusic!, assetId: 'replacement' };
  h.input.assets.push({ id: 'replacement', src: 'data:audio/wav;base64,AQ==' });
  h.player.update(h.input);
  await h.tick();
  expect(h.music.paused).toBe(true);
  h.click('previous');
  await h.tick();
  expect(h.music.paused).toBe(false);
});
it('finishes an active visit when a document update removes its final slide', async () => {
  const h = await mount();
  h.click('next');
  await h.tick();
  h.music.currentTime = 4;
  h.tour.slides = [];
  h.player.update(h.input);
  await h.tick();
  expect(h.music.paused).toBe(true);
  expect(h.music.currentTime).toBe(0);
  expect(h.root.dataset['slideId']).toBe('');
});
it('uses real local narration state for ducking without stopping the music visit', async () => {
  const h = await mount();
  const first = h.tour.slides[0]!;
  if (first.kind !== 'image') throw new Error('Expected image');
  const narration = {
    assetId: 'voice',
    duration: 4,
    trimStart: 0,
    trimEnd: 4,
    gain: 0.5,
    transcript: '',
    trigger: 'activation' as const,
  };
  h.input.assets.push({ id: 'voice', src: 'data:audio/wav;base64,AQ==' });
  h.tour.slides[0] = {
    kind: 'navigation',
    id: 'first',
    title: 'Choice',
    description: '',
    background: { color: '#000000', image: null },
    narration: null,
    timing: first.timing,
    buttons: [
      {
        id: 'voice',
        label: 'Stay',
        action: { kind: 'none' },
        narration,
      },
    ],
  };
  h.player.update(h.input);
  await h.tick();
  h.click('play');
  await h.tick();
  const local = h.root.querySelector<HTMLButtonElement>('[data-tour-narration-toggle="voice"]')!;
  local.click();
  await h.tick();
  expect(h.music.paused).toBe(false);
  expect(h.ramps.at(-1)).toBe(0.25);
  local.click();
  await h.tick();
  expect(h.ramps.at(-1)).toBe(1);
  expect(h.music.paused).toBe(false);
  const volume = h.root.querySelector<HTMLInputElement>('[data-tour-volume]')!;
  volume.value = '0.5';
  volume.dispatchEvent(new Event('input', { bubbles: true }));
  expect(h.music.volume).toBeCloseTo(0.2);
  h.click('music-mute');
  expect(h.music.volume).toBe(0);
  h.click('mute');
  h.click('music-mute');
  expect(h.music.volume).toBe(0);
  h.click('mute');
  expect(h.music.volume).toBeCloseTo(0.2);
});
it('preserves active music through full view and manual mode but suspends on external departure', async () => {
  const h = await mount();
  const first = h.tour.slides[0]!;
  if (first.kind !== 'image') throw new Error('Expected image');
  first.image = {
    assetId: 'image',
    galleryAssetId: null,
    editDocumentId: null,
    width: 400,
    height: 200,
    alt: '',
    source: { kind: 'import', filename: 'test.png' },
  };
  first.camera = { mode: 'manual', zoom: 3, center: { x: 0.5, y: 0.5 } };
  h.input.assets.push({ id: 'image', src: 'data:image/png;base64,AA==' });
  h.player.update(h.input);
  await h.tick();
  await h.tick();
  h.click('play');
  await h.tick();
  h.music.currentTime = 3;
  h.click('full-view');
  h.click('manual');
  await h.tick();
  expect(h.music.paused).toBe(false);
  expect(h.music.currentTime).toBe(3);
  const link = document.createElement('a');
  link.href = '#external';
  h.root.append(link);
  link.addEventListener('click', (event) => event.preventDefault());
  link.click();
  expect(h.music.paused).toBe(true);
  h.click('next');
  await h.tick();
  expect(h.music.paused).toBe(true);
});
it('admits an authored no-op point and only explicit Restart replays an exhausted non-loop track', async () => {
  const h = await mount();
  const first = h.tour.slides[0]!;
  h.tour.backgroundMusic!.loop = false;
  h.tour.slides[0] = {
    kind: 'navigation',
    id: 'first',
    title: 'Actions',
    description: '',
    background: { color: '#000000', image: null },
    narration: null,
    timing: first.timing,
    buttons: [
      { id: 'stay', label: 'Stay', action: { kind: 'none' } },
      { id: 'restart', label: 'Restart', action: { kind: 'restart' } },
    ],
  };
  h.player.update(h.input);
  await h.tick();
  h.root.querySelector<HTMLButtonElement>('[data-tour-object-id="stay"]')!.click();
  await h.tick();
  expect(h.music.paused).toBe(false);
  Object.defineProperty(h.music, 'ended', { configurable: true, get: () => true });
  h.music.currentTime = 30;
  h.music.dispatchEvent(new Event('ended'));
  h.click('next');
  await h.tick();
  h.click('previous');
  await h.tick();
  expect(h.music.paused).toBe(true);
  h.root.querySelector<HTMLButtonElement>('[data-tour-object-id="restart"]')!.click();
  await h.tick();
  expect(h.music.paused).toBe(false);
  expect(h.music.currentTime).toBe(0);
});
it('keeps optional music failure independent of navigation and retries only accepted viewer actions', async () => {
  const h = await mount();
  h.play.mockRejectedValueOnce(new DOMException('gesture', 'NotAllowedError'));
  h.click('play');
  await h.tick();
  expect(h.music.paused).toBe(true);
  const attempts = h.play.mock.calls.length;
  await h.tick(100);
  expect(h.root.dataset['slideId']).toBe('second');
  expect(h.play).toHaveBeenCalledTimes(attempts);
  h.click('next');
  await h.tick();
  expect(h.music.paused).toBe(false);
  expect(h.play).toHaveBeenCalledTimes(attempts + 1);
  h.music.dispatchEvent(new Event('error'));
  h.root.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
  h.click('music-retry');
  await h.tick();
  expect(h.play).toHaveBeenCalledTimes(attempts + 1);
  expect(h.music.paused).toBe(true);
});
