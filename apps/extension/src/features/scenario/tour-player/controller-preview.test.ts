// @vitest-environment jsdom
import { createGradientPaint } from '@sniptale/foundation/paint';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTourDocument, createTourImageSlide } from '../project/factories';
import { buildTourPlayerHtml } from './document';
import { createTourPlayer } from './controller';
import type { TourDocument } from '@sniptale/runtime-contracts/scenario/types/tour';

const labels = {
  expand: 'expand',
  collapse: 'collapse',
  previous: 'previous',
  next: 'next',
  contents: 'contents',
  close: 'close',
  restart: 'restart',
  finished: 'finished',
  empty: 'empty',
  point: 'point',
  details: 'details',
  play: 'play',
  pause: 'pause',
  seek: 'seek',
  retry: 'retry',
  loading: 'loading',
  mediaError: 'media failed',
  choose: 'choose',
  audioBlocked: 'audio blocked',
  audioError: 'narration failed',
};
const mounted: { player: ReturnType<typeof createTourPlayer>; root: HTMLElement }[] = [];
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => {
  mounted.splice(0).forEach(({ player, root }) => {
    player.dispose();
    root.remove();
  });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Decodes editor image assets immediately without network or timer waits. */
function instantImages() {
  vi.stubGlobal(
    'Image',
    class {
      onload: (() => void) | null = null;
      onerror: ((error?: unknown) => void) | null = null;
      decode = () => Promise.resolve();
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
  );
}

function playbackFrames() {
  let time = 0;
  let id = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.spyOn(performance, 'now').mockImplementation(() => time);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callbacks.set(++id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (token: number) => callbacks.delete(token));
  return async (delta: number) => {
    time += delta;
    const queued = [...callbacks.values()];
    callbacks.clear();
    queued.forEach((callback) => callback(time));
    await Promise.resolve();
    await Promise.resolve();
  };
}

function imageSlide(id: string) {
  const slide = createTourImageSlide(id);
  slide.image = {
    assetId: 'image',
    galleryAssetId: null,
    editDocumentId: null,
    width: 100,
    height: 100,
    alt: '',
    source: { kind: 'import', filename: 'image.png' },
  };
  return slide;
}

function previewTour(): TourDocument {
  const tour = createTourDocument();
  tour.transition = { kind: 'none', durationMs: 0, hotspotTravelMs: 0 };
  tour.playback = { ...tour.playback, autoplay: true };
  return tour;
}

async function mount(
  tour: TourDocument,
  assets: { id: string; mime: string; base64: string }[] = []
) {
  const html = await buildTourPlayerHtml({ tour, title: 'Preview', labels, assets });
  const root = new DOMParser().parseFromString(html, 'text/html').getElementById('tour-player')!;
  document.body.append(root);
  const player = createTourPlayer(
    root,
    {
      tour,
      labels,
      assets: assets.map((asset) => ({
        id: asset.id,
        src: `data:${asset.mime};base64,${asset.base64}`,
      })),
    },
    { preview: true }
  );
  const value = { player, root };
  mounted.push(value);
  return value;
}

async function settleMedia() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

it('runs bounded in-tour actions in preview while URL actions stay inert buttons', async () => {
  const tour = previewTour();
  const second = {
    kind: 'navigation' as const,
    id: 'second',
    title: 'Second',
    description: '',
    background: { color: '#111827', image: null },
    narration: null,
    timing: createTourImageSlide().timing,
    buttons: [
      {
        id: 'b-first',
        label: 'Back to first',
        action: { kind: 'slide' as const, slideId: 'first' },
      },
      {
        id: 'b-url',
        label: 'Open site',
        action: { kind: 'url' as const, url: 'https://example.com/' },
      },
    ],
  };
  tour.slides = [createTourImageSlide('first'), second];
  const { player, root } = await mount(tour);
  await settleMedia();
  player.select('second');
  const action = (label: string) => {
    const node = [...root.querySelectorAll<HTMLElement>('button, a')].find(
      (entry) => entry.textContent === label
    );
    if (!node) throw new Error(`Missing ${label}`);
    return node;
  };
  const link = action('Open site');
  expect(link.tagName).toBe('BUTTON');
  expect(root.querySelector('a[href]')).toBeNull();
  link.click();
  await settleMedia();
  expect(root.dataset['slideId']).toBe('second');
  expect(root.querySelector('a[href]')).toBeNull();
  action('Back to first').click();
  await settleMedia();
  expect(root.dataset['slideId']).toBe('first');
});

it('keeps URL hotspots as buttons in preview and still opens their explanation', async () => {
  instantImages();
  const tick = playbackFrames();
  const tour = previewTour();
  const slide = imageSlide('first');
  slide.hotspots = [
    {
      id: 'point',
      point: { x: 0.5, y: 0.5 },
      targetRect: null,
      label: 'Open',
      text: 'Details',
      action: { kind: 'url', url: 'https://example.com/' },
      appearance: null,
      pulse: false,
    },
  ];
  tour.slides = [slide];
  const { root } = await mount(tour, [{ id: 'image', mime: 'image/png', base64: 'AA==' }]);
  await settleMedia();
  await tick(1200);
  const scene = root.querySelector<HTMLElement>('[data-tour-scene]')!;
  expect(scene.inert).toBe(false);
  const hotspot = scene.querySelector<HTMLElement>('.tour-hotspot')!;
  expect(hotspot.tagName).toBe('BUTTON');
  expect(root.querySelector('a[href]')).toBeNull();
  hotspot.click();
  expect(root.querySelector<HTMLElement>('[data-tour-hint]')!.hidden).toBe(false);
  expect(root.querySelector('[data-tour-hint-text]')!.textContent).toBe('Details');
  hotspot.click();
  expect(root.dataset['slideId']).toBe('first');
  expect(root.querySelector('a[href]')).toBeNull();
});

it('plays available narration in preview, reports a denied gesture and releases audio on dispose', async () => {
  const play = vi
    .spyOn(HTMLMediaElement.prototype, 'play')
    .mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'))
    .mockResolvedValue(undefined);
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const tour = previewTour();
  const slide = createTourImageSlide('first');
  slide.narration = {
    assetId: 'voice',
    duration: 2,
    trimStart: 0,
    trimEnd: 2,
    gain: 1,
    transcript: '',
  };
  tour.slides = [slide];
  const tick = playbackFrames();
  const { player, root } = await mount(tour, [{ id: 'voice', mime: 'audio/wav', base64: 'AA==' }]);
  await settleMedia();
  await tick(0);
  await settleMedia();
  const audio = root.querySelector('audio')!;
  expect(audio.getAttribute('src')).toContain('data:audio');
  expect(play).toHaveBeenCalledOnce();
  const status = root.querySelector<HTMLElement>('.tour-playback-status')!;
  expect(status.textContent).toBe('audio blocked');
  root.querySelector<HTMLButtonElement>('[data-tour-play]')!.click();
  await settleMedia();
  expect(play).toHaveBeenCalledTimes(2);
  expect(status.textContent).not.toBe('audio blocked');
  player.dispose();
  expect(pause).toHaveBeenCalled();
  expect(root.querySelector('audio')).toBeNull();
});

it('scopes preview hint dismissal to the player root and keeps document navigation keys inert', async () => {
  instantImages();
  const tick = playbackFrames();
  const tour = previewTour();
  const slide = imageSlide('first');
  slide.hotspots = [
    {
      id: 'point',
      point: { x: 0.5, y: 0.5 },
      targetRect: null,
      label: 'Point',
      text: 'Details',
      action: { kind: 'none' },
      appearance: null,
      pulse: false,
    },
  ];
  tour.slides = [slide, createTourImageSlide('second')];
  const { root } = await mount(tour, [{ id: 'image', mime: 'image/png', base64: 'AA==' }]);
  await settleMedia();
  await tick(1200);
  const hotspot = root.querySelector<HTMLElement>('.tour-hotspot')!;
  const hint = () => root.querySelector<HTMLElement>('[data-tour-hint]')!;
  hotspot.focus();
  expect(hint().hidden).toBe(false);
  document.body.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  );
  expect(hint().hidden).toBe(false);
  hotspot.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  );
  expect(hint().hidden).toBe(true);
  expect(document.activeElement).toBe(hotspot);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  expect(root.dataset['slideId']).toBe('first');
});

it('releases preview scene, listeners and pending playback on dispose', async () => {
  instantImages();
  playbackFrames();
  const tour = previewTour();
  tour.slides = [imageSlide('first'), createTourImageSlide('second')];
  const { player, root } = await mount(tour, [{ id: 'image', mime: 'image/png', base64: 'AA==' }]);
  await settleMedia();
  const next = root.querySelector<HTMLButtonElement>('[data-tour-next]')!;
  player.dispose();
  next.click();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  expect(root.dataset['slideId']).toBe('first');
  expect(root.querySelector('[data-tour-scene]')!.children).toHaveLength(0);
  expect(root.querySelector('audio')).toBeNull();
});

it('reports audio decoding failure separately from images and retries narration', async () => {
  const play = vi
    .spyOn(HTMLMediaElement.prototype, 'play')
    .mockRejectedValueOnce(new DOMException('decode', 'NotSupportedError'))
    .mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const tour = previewTour();
  const slide = createTourImageSlide('voice-slide');
  slide.narration = {
    assetId: 'voice',
    duration: 2,
    trimStart: 0,
    trimEnd: 2,
    gain: 1,
    transcript: '',
  };
  tour.slides = [slide];
  const tick = playbackFrames();
  const { root } = await mount(tour, [{ id: 'voice', mime: 'audio/wav', base64: 'AA==' }]);
  await settleMedia();
  await tick(0);
  await settleMedia();
  expect(root.querySelector('[data-tour-status]')!.textContent).toBe('narration failed');
  expect(root.querySelector('[data-tour-play]')!.getAttribute('aria-label')).toBe('retry');
  expect(root.querySelector('[data-tour-play]')!.getAttribute('data-tour-face')).toBe('retry');
  root.querySelector<HTMLButtonElement>('[data-tour-play]')!.click();
  await settleMedia();
  expect(play).toHaveBeenCalledTimes(2);
  expect(root.querySelector('[data-tour-status]')!.textContent).toBe('');
});

it('uses accessible icon narration actions without firing navigation and permits activation retry', async () => {
  const play = vi
    .spyOn(HTMLMediaElement.prototype, 'play')
    .mockRejectedValueOnce(new DOMException('decode', 'NotSupportedError'))
    .mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const narration = {
    assetId: 'voice',
    duration: 2,
    trimStart: 0,
    trimEnd: 2,
    gain: 1,
    transcript: '',
    trigger: 'activation' as const,
  };
  const tour = previewTour();
  instantImages();
  const slide = imageSlide('hint');
  slide.annotations = [{ id: 'note', text: 'Note', anchor: null, appearance: null, narration }];
  tour.slides = [
    slide,
    {
      kind: 'navigation',
      id: 'navigation',
      title: 'Navigation',
      description: '',
      background: { color: '#111827', image: null },
      narration: null,
      timing: slide.timing,
      buttons: [{ id: 'jump', label: 'Next slide', action: { kind: 'next' }, narration }],
    },
  ];
  const { root, player } = await mount(tour, [
    { id: 'voice', mime: 'audio/wav', base64: 'AA==' },
    { id: 'image', mime: 'image/png', base64: 'AA==' },
  ]);
  await settleMedia();
  const hint = root.querySelector<HTMLButtonElement>('[data-tour-narration="note"]')!;
  expect(hint.textContent).toBe('');
  expect(hint.getAttribute('aria-label')).toBe('play');
  expect(hint.title).toBe('play');
  expect(hint.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  hint.click();
  await settleMedia();
  expect(root.querySelector('[data-tour-status]')!.textContent).toBe('narration failed');
  hint.click();
  await settleMedia();
  expect(play).toHaveBeenCalledTimes(2);
  expect(root.querySelector('[data-tour-status]')!.textContent).toBe('');
  player.select('navigation');
  const voice = root.querySelector<HTMLButtonElement>('[data-tour-narration="jump"]')!;
  expect(voice.textContent).toBe('');
  expect(voice.getAttribute('aria-label')).toBe('play');
  expect(voice.title).toBe('play');
  expect(voice.classList.contains('tour-icon-button')).toBe(true);
  voice.click();
  await settleMedia();
  expect(root.dataset['slideId']).toBe('navigation');
  expect(play).toHaveBeenCalledTimes(3);
});

it('does not turn pending image URLs into relative undefined requests', async () => {
  instantImages();
  const tour = previewTour();
  const slide = imageSlide('image');
  tour.slides = [
    slide,
    {
      kind: 'navigation',
      id: 'navigation',
      title: 'Navigation',
      description: '',
      background: { color: '#111827', image: slide.image },
      narration: null,
      timing: slide.timing,
      buttons: [],
    },
  ];
  const { root, player } = await mount(tour, [{ id: 'image', mime: 'image/png', base64: 'AA==' }]);
  player.update({ tour, labels, assets: [] });
  expect(root.querySelector('img.tour-image')!.getAttribute('src')).toBeNull();
  player.select('navigation');
  expect(root.querySelector('img.tour-navigation-image')!.getAttribute('src')).toBeNull();
});

it.each(['loading', 'running'] as const)(
  'keeps camera entrance through %s viewport layout',
  async (phase) => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const tick = playbackFrames();
    const pending: { onload: (() => void) | null; onerror: (() => void) | null; src: string }[] =
      [];
    vi.stubGlobal(
      'Image',
      class {
        src = '';
        onload = null;
        onerror = null;
        constructor() {
          pending.push(this);
        }
      }
    );
    const tour = previewTour();
    tour.playback.autoplay = false;
    const slide = imageSlide('first');
    slide.camera = {
      mode: 'manual',
      center: { x: 0.5, y: 0.5 },
      zoom: 2,
      delayMs: 0,
      durationMs: 1000,
    };
    tour.slides = [slide];
    const { root } = await mount(tour, [{ id: 'image', mime: 'image/png', base64: 'AA==' }]);
    if (phase === 'running') {
      pending.at(-1)!.onload!();
      await tick(0);
      await tick(250);
    }
    const viewport = root.querySelector<HTMLElement>('[data-tour-viewport]')!;
    Object.defineProperty(viewport, 'clientWidth', { value: 500, configurable: true });
    window.dispatchEvent(new Event('resize'));
    if (phase === 'loading') {
      expect(root.querySelector<HTMLElement>('[data-tour-scene]')!.inert).toBe(true);
      pending.at(-1)!.onload!();
      await tick(0);
      await tick(250);
    }
    const plane = root.querySelector<HTMLElement>('.tour-image-plane')!;
    expect(plane.style.transform).toContain('scale(0.578125)');
    await tick(250);
    expect(plane.style.transform).toContain('scale(0.75)');
    await tick(500);
    expect(plane.style.transform).toBe('');
    expect(root.querySelector<HTMLElement>('[data-tour-stage]')!.dataset['motion']).toBe('settled');
    expect(root.dataset['slideId']).toBe('first');
  }
);

it('renders inherited and local marker colors and diameter independently of pulse', async () => {
  instantImages();
  playbackFrames();
  const tour = previewTour();
  Object.assign(tour.style, {
    markerAppearance: { color: '#2367ab', pulseColor: '#ab3267', size: 48 },
  });
  const slide = imageSlide('markers');
  slide.hotspots = [
    {
      id: 'inherited',
      point: { x: 0.3, y: 0.4 },
      targetRect: null,
      label: 'Inherited',
      text: 'Details',
      action: { kind: 'none' },
      appearance: null,
      pulse: false,
    },
    {
      id: 'local',
      point: { x: 0.7, y: 0.6 },
      targetRect: null,
      label: 'Local',
      text: 'Details',
      action: { kind: 'none' },
      appearance: null,
      pulse: true,
    },
  ];
  Object.assign(slide.hotspots[1]!, {
    markerAppearance: { color: '#123456', pulseColor: null, size: 16 },
  });
  tour.slides = [slide];
  const saved = JSON.stringify(tour);
  const { root } = await mount(tour, [{ id: 'image', mime: 'image/png', base64: 'AA==' }]);
  await settleMedia();
  const markers = [...root.querySelectorAll<HTMLElement>('.tour-hotspot')];
  expect(markers).toHaveLength(2);
  expect(markers[0]!.style.getPropertyValue('--tour-marker-color')).toBe('#2367ab');
  expect(markers[0]!.style.getPropertyValue('--tour-marker-pulse-color')).toBe('#ab3267');
  expect(markers[0]!.style.getPropertyValue('--tour-marker-size')).toBe('48px');
  expect(markers[0]!.dataset['pulse']).toBe('false');
  expect(markers[1]!.style.getPropertyValue('--tour-marker-color')).toBe('#123456');
  expect(markers[1]!.style.getPropertyValue('--tour-marker-pulse-color')).toBe(tour.style.accent);
  expect(markers[1]!.style.getPropertyValue('--tour-marker-size')).toBe('16px');
  expect(markers[1]!.dataset['pulse']).toBe('true');
  expect(JSON.stringify(tour)).toBe(saved);
});

it('updates stage paint and image layers without changing scene geometry', async () => {
  instantImages();
  const tour = previewTour();
  tour.slides = [imageSlide('first')];
  const assets = [{ id: 'image', mime: 'image/png', base64: 'AA==' }];
  const { root, player } = await mount(tour, assets);
  const stage = root.querySelector<HTMLElement>('[data-tour-stage]')!;
  const dimensions = [stage.style.width, stage.style.height];
  expect(stage.style.backgroundColor).toBe('rgb(17, 24, 39)');
  tour.stage.paint = { kind: 'solid', color: '#123456' };
  tour.stage.image = imageSlide('background').image;
  tour.stage.imageFit = 'contain';
  const update = (src = 'data:image/png;base64,AA==') =>
    player.update({ tour, labels, assets: [{ id: 'image', src }] });
  update();
  expect(stage.style.backgroundColor).toBe('rgb(18, 52, 86)');
  expect(stage.style.backgroundImage).toContain('data:image/png;base64,AA==');
  expect(stage.style.backgroundSize).toBe('contain');
  expect(stage.style.backgroundRepeat).toBe('no-repeat');
  let stop = 0;
  tour.stage.paint = createGradientPaint('#abcdef', () => `stop-${++stop}`);
  update();
  expect(stage.style.backgroundImage).toContain('linear-gradient');
  expect(stage.style.backgroundImage).toContain('data:image/png;base64,AA==');
  expect(stage.style.backgroundSize).toBe('contain, auto');
  tour.stage.image = null;
  update();
  expect(stage.style.backgroundImage).toContain('linear-gradient');
  expect(stage.style.backgroundImage).not.toContain('url(');
  tour.stage.paint = { kind: 'solid', color: '#123456' };
  tour.stage.image = imageSlide('background').image;
  update('data:image/png;base64,AQ==');
  expect(stage.style.backgroundImage).toContain('data:image/png;base64,AQ==');
  delete tour.stage.imageFit;
  update();
  expect(stage.style.backgroundSize).toBe('cover');
  player.update({ tour, labels, assets: [] });
  expect(stage.style.backgroundImage).not.toContain('url(');
  tour.stage.image = null;
  delete tour.stage.paint;
  update();
  expect(stage.style.backgroundImage).not.toContain('url(');
  expect(stage.style.backgroundColor).toBe('rgb(17, 24, 39)');
  expect([stage.style.width, stage.style.height]).toEqual(dimensions);
});

it('keeps manual entrances separate from playback and routes Space by persistent mode', async () => {
  instantImages();
  const tick = playbackFrames();
  const tour = previewTour();
  tour.playback.autoplay = false;
  tour.slides = [createTourImageSlide('first'), createTourImageSlide('second')];
  const { root } = await mount(tour);
  await settleMedia();
  const press = (repeat = false) => {
    const event = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
      repeat,
    });
    root.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  };
  expect(root.dataset['tourMode']).toBe('manual');
  press();
  expect(root.dataset['slideId']).toBe('second');
  press(true);
  expect(root.dataset['slideId']).toBe('second');
  await tick(100000);
  expect(root.dataset['slideId']).toBe('second');
  root.querySelector<HTMLButtonElement>('[data-tour-play]')!.click();
  expect(root.dataset['tourMode']).toBe('playback');
  press();
  press();
  await tick(100000);
  expect(root.dataset['slideId']).toBe('second');
  expect(root.querySelector('[data-tour-play]')!.getAttribute('aria-pressed')).toBe('false');
  root.querySelector<HTMLButtonElement>('[data-tour-manual]')!.click();
  press();
  expect(root.dataset['slideId']).toBe('end');
});

it('admits Space only for the active player and leaves native controls and modified keys alone', async () => {
  instantImages();
  playbackFrames();
  const tour = previewTour();
  tour.playback.autoplay = false;
  tour.slides = [createTourImageSlide('first'), createTourImageSlide('second')];
  const first = await mount(tour);
  const second = await mount(tour);
  for (const tag of ['input', 'textarea', 'select', 'button', 'a']) {
    const control = document.createElement(tag);
    first.root.append(control);
    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    control.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  }
  for (const init of [{ ctrlKey: true }, { isComposing: true }, { altKey: true }]) {
    const event = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
      ...init,
    });
    first.root.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  }
  first.root.dispatchEvent(
    new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
  );
  expect(first.root.dataset['slideId']).toBe('second');
  expect(second.root.dataset['slideId']).not.toBe('second');
});

it('retains authored playback mode when hidden and manual choice cancels pending media progression', async () => {
  const tick = playbackFrames();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  const hidden = await mount(previewTour());
  expect(hidden.root.dataset['tourMode']).toBe('playback');
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const ready: (() => void)[] = [];
  vi.stubGlobal(
    'Image',
    class {
      onload: (() => void) | null = null;
      set src(_value: string) {
        ready.push(() => this.onload?.());
      }
    }
  );
  const tour = previewTour();
  tour.slides = [imageSlide('first'), imageSlide('second')];
  const { root } = await mount(tour, [{ id: 'image', mime: 'image/png', base64: 'AA==' }]);
  root.querySelector<HTMLButtonElement>('[data-tour-manual]')!.click();
  root.querySelector<HTMLButtonElement>('[data-tour-next]')!.click();
  ready.forEach((resolve) => resolve());
  await tick(100000);
  await tick(100000);
  expect(root.dataset['slideId']).toBe('second');
  expect(root.dataset['tourMode']).toBe('manual');
});

it('preserves consumed keys, contents dialog and ARIA control focus', async () => {
  playbackFrames();
  const tour = previewTour();
  tour.playback.autoplay = false;
  tour.slides = [createTourImageSlide('first'), createTourImageSlide('second')];
  const { root } = await mount(tour);
  const consumed = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
  consumed.preventDefault();
  root.dispatchEvent(consumed);
  for (const role of ['slider', 'combobox', 'menuitem', 'button']) {
    const control = document.createElement('div');
    control.setAttribute('role', role);
    control.tabIndex = 0;
    root.append(control);
    control.focus();
    control.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(document.activeElement).toBe(control);
    const key = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    control.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false);
  }
  root.querySelector<HTMLDialogElement>('[data-tour-navigation]')!.open = true;
  const key = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
  root.dispatchEvent(key);
  expect(key.defaultPrevented).toBe(false);
  expect(root.dataset['slideId']).toBe('first');
});
