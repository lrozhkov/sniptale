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

async function mount(options?: Parameters<typeof createTourPlayer>[2]) {
  const tour = createTourDocument('tour');
  tour.slides = [createTourImageSlide('first'), createTourImageSlide('second')];
  const html = await buildTourPlayerHtml({ tour, title: 'Tour', labels, assets: [] });
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const root = parsed.getElementById('tour-player');
  if (!root) throw new Error('Missing player fixture');
  document.body.append(root);
  const player = createTourPlayer(root, { tour, labels, assets: [] }, options);
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

function authoringInput() {
  const tour = createTourDocument('authored');
  const slide = createTourImageSlide('first');
  slide.image = {
    assetId: 'image',
    galleryAssetId: null,
    editDocumentId: null,
    width: 100,
    height: 100,
    alt: '',
    source: { kind: 'import', filename: 'image.png' },
  };
  slide.hotspots = [
    {
      id: 'point',
      point: { x: 0.5, y: 0.5 },
      targetRect: null,
      label: 'Open',
      text: 'Text',
      action: { kind: 'url', url: 'https://example.com/' },
      appearance: null,
      pulse: false,
    },
  ];
  tour.slides = [slide, createTourImageSlide('second')];
  return {
    tour,
    labels,
    assets: [
      {
        id: 'image',
        src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=',
      },
    ],
  };
}

function pointer(node: HTMLElement, name: string, x: number, y = 0) {
  const event = new MouseEvent(name, {
    clientX: x,
    clientY: y,
    button: 0,
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  node.dispatchEvent(event);
}

it('updates the scene in place and selects authored URL objects without opening links', async () => {
  const onSelectObject = vi.fn();
  const { player, root } = await mount({ authoring: { onSelectObject, onMoveObject: vi.fn() } });
  const viewport = root.querySelector('[data-tour-viewport]');
  const input = authoringInput();
  player.update(input);
  expect(root.querySelector('[data-tour-viewport]')).toBe(viewport);
  expect(root.querySelector('.tour-hotspot')?.tagName).toBe('BUTTON');
  root.querySelector<HTMLButtonElement>('.tour-hotspot')!.click();
  expect(onSelectObject).toHaveBeenCalledWith('point');
  expect(root.dataset['slideId']).toBe('first');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
  expect(root.dataset['slideId']).toBe('first');
  player.selectObject('point');
  expect(root.querySelector<HTMLElement>('.tour-hotspot')!.dataset['selected']).toBe('true');
  player.select('second');
  player.update({ ...input, tour: { ...input.tour, slides: [...input.tour.slides].reverse() } });
  expect(root.dataset['slideId']).toBe('second');
});

it.each([false, true])(
  'keeps editing coordinates independent of auto zoom %s and cancels Escape',
  async (autoZoom) => {
    const onMoveObject = vi.fn();
    const { player, root } = await mount({ authoring: { onSelectObject: vi.fn(), onMoveObject } });
    const input = authoringInput();
    input.tour.playback.autoZoom = autoZoom;
    player.update(input);
    const point = root.querySelector<HTMLElement>('.tour-hotspot')!;
    pointer(point, 'pointerdown', 0);
    pointer(point, 'pointermove', 36);
    expect(onMoveObject).not.toHaveBeenCalled();
    pointer(point, 'pointerup', 36);
    expect(onMoveObject).toHaveBeenCalledExactlyOnceWith('point', {
      x: 0.6,
      y: 0.5,
    });
    expect(
      input.tour.slides[0]?.kind === 'image' && input.tour.slides[0].hotspots[0]?.point
    ).toEqual({ x: 0.5, y: 0.5 });
    const original = point.style.left;
    pointer(point, 'pointerdown', 0);
    pointer(point, 'pointermove', 10000);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(point.style.left).toBe(original);
    pointer(point, 'pointerup', 10000);
    expect(onMoveObject).toHaveBeenCalledTimes(1);
  }
);

it('cancels an active object gesture when the player is disposed', async () => {
  const onMoveObject = vi.fn();
  const { player, root } = await mount({ authoring: { onSelectObject: vi.fn(), onMoveObject } });
  player.update(authoringInput());
  const point = root.querySelector<HTMLElement>('.tour-hotspot')!;
  pointer(point, 'pointerdown', 0);
  pointer(point, 'pointermove', 36);
  player.dispose();
  pointer(point, 'pointerup', 36);
  expect(onMoveObject).not.toHaveBeenCalled();
});

it('preserves the selected object after the scene is resized', async () => {
  const { player, root } = await mount({
    authoring: { onSelectObject: vi.fn(), onMoveObject: vi.fn() },
  });
  player.update(authoringInput());
  player.selectObject('point');
  window.dispatchEvent(new Event('resize'));
  expect(
    root.querySelector<HTMLElement>('[data-tour-object-id="point"]')?.dataset['selected']
  ).toBe('true');
});

it('does not preview or commit object drags while the host locks editing', async () => {
  let editable = false;
  const moved = vi.fn();
  const { player, root } = await mount({
    authoring: { onSelectObject: vi.fn(), onMoveObject: moved, canEdit: () => editable },
  });
  player.update(authoringInput());
  const marker = root.querySelector<HTMLElement>('.tour-hotspot')!;
  const original = marker.style.left;
  pointer(marker, 'pointerdown', 0);
  pointer(marker, 'pointermove', 50);
  pointer(marker, 'pointerup', 50);
  expect(marker.style.left).toBe(original);
  expect(moved).not.toHaveBeenCalled();
  editable = true;
  pointer(marker, 'pointerdown', 0);
  pointer(marker, 'pointermove', 50);
  editable = false;
  pointer(marker, 'pointerup', 50);
  expect(marker.style.left).toBe(original);
  expect(moved).not.toHaveBeenCalled();
});

it('selects an authored mask with native click activation without moving it', async () => {
  const selected = vi.fn();
  const moved = vi.fn();
  const { player, root } = await mount({
    authoring: { onSelectObject: selected, onMoveObject: moved },
  });
  const input = authoringInput();
  const slide = input.tour.slides[0]!;
  if (slide.kind !== 'image') throw new Error('Expected image');
  slide.masks = [
    {
      id: 'mask',
      rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      kind: 'highlight',
      color: '#F97316',
      opacity: 0.3,
    },
  ];
  player.update(input);
  root.querySelector<HTMLButtonElement>('.tour-mask')!.click();
  expect(selected).toHaveBeenCalledWith('mask');
  expect(moved).not.toHaveBeenCalled();
});

it('separates structural Previous from visited Back and clears history on Restart', async () => {
  const { player, root } = await mount();
  const tour = createTourDocument('routes');
  tour.slides = ['a', 'b', 'c'].map((id) => ({
    kind: 'navigation' as const,
    id,
    title: id,
    description: '',
    background: { color: '#111827', image: null },
    narration: null,
    timing: createTourImageSlide().timing,
    buttons: [
      { id: `${id}-jump`, label: 'Jump C', action: { kind: 'slide' as const, slideId: 'c' } },
      { id: `${id}-previous`, label: 'Previous slide', action: { kind: 'previous' as const } },
      { id: `${id}-restart`, label: 'Restart tour', action: { kind: 'restart' as const } },
    ],
  }));
  player.update({ tour, labels, assets: [] });
  const press = (label: string) => {
    const button = [...root.querySelectorAll<HTMLButtonElement>('button')].find(
      (node) => node.textContent === label
    );
    if (!button) throw new Error(`Missing ${label}`);
    button.click();
  };
  press('Jump C');
  expect(root.dataset['slideId']).toBe('c');
  press('Previous slide');
  expect(root.dataset['slideId']).toBe('b');
  root.querySelector<HTMLButtonElement>('[data-tour-previous]')!.click();
  expect(root.dataset['slideId']).toBe('c');
  press('Restart tour');
  expect(root.dataset['slideId']).toBe('a');
  expect(root.querySelector<HTMLButtonElement>('[data-tour-previous]')!.disabled).toBe(true);
});

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
function shortTour() {
  const tour = createTourDocument('timed');
  tour.transition = { kind: 'none', durationMs: 0, hotspotTravelMs: 0 };
  tour.slides = ['first', 'second', 'third'].map((id) => {
    const slide = createTourImageSlide(id);
    slide.timing = { ...slide.timing, mode: 'manual', holdSeconds: 0.1 };
    return slide;
  });
  return tour;
}
it('plays, pauses, seeks across a linear tour and pauses when hidden without auto-resuming', async () => {
  const { player, root } = await mount();
  const tick = playbackFrames();
  const tour = shortTour();
  player.update({ tour, labels, assets: [] });
  await tick(0);
  const play = root.querySelector<HTMLButtonElement>('[data-tour-play]')!;
  const seek = root.querySelector<HTMLInputElement>('[data-tour-seek]')!;
  play.click();
  await tick(100);
  expect(root.dataset['slideId']).toBe('second');
  play.click();
  await tick(1000);
  expect(root.dataset['slideId']).toBe('second');
  seek.value = '100';
  seek.dispatchEvent(new Event('input', { bubbles: true }));
  play.click();
  await tick(40);
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  document.dispatchEvent(new Event('visibilitychange'));
  await tick(1000);
  expect(root.dataset['slideId']).toBe('second');
  expect(play.textContent).toBe('Play');
  hidden.mockReturnValue(false);
  document.dispatchEvent(new Event('visibilitychange'));
  await tick(1000);
  expect(root.dataset['slideId']).toBe('second');
  play.click();
  await tick(60);
  expect(root.dataset['slideId']).toBe('third');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
  expect(root.dataset['slideId']).toBe('first');
  expect(play.textContent).toBe('Play');
  seek.value = '200';
  seek.dispatchEvent(new Event('input', { bubbles: true }));
  expect(root.dataset['slideId']).toBe('third');
});
it('waits at automatic cycles and ambiguous routes, but permits an explicitly looping tour', async () => {
  const { player, root } = await mount();
  const tick = playbackFrames();
  const tour = shortTour();
  tour.slides[1]!.timing.autoplayTarget = 'first';
  player.update({ tour, labels, assets: [] });
  await tick(0);
  const play = root.querySelector<HTMLButtonElement>('[data-tour-play]')!;
  play.click();
  await tick(100);
  await tick(100);
  expect(root.dataset['slideId']).toBe('second');
  expect(play.textContent).toBe('Play');
  expect(root.querySelector('[role=status]')!.textContent).toBe('Choose a destination');
  expect(root.querySelector<HTMLInputElement>('[data-tour-seek]')!.max).toBe('100');
  tour.playback.loop = true;
  player.update({ tour, labels, assets: [] });
  await tick(0);
  play.click();
  await tick(100);
  expect(root.dataset['slideId']).toBe('first');
  await tick(100);
  expect(root.dataset['slideId']).toBe('second');
  player.dispose();
  await tick(1000);
  expect(root.dataset['slideId']).toBe('second');
});
it('stops at the technical end and restarts from its play control with empty back history', async () => {
  const { player, root } = await mount();
  const tick = playbackFrames();
  const tour = shortTour();
  tour.endScreen.enabled = true;
  player.update({ tour, labels, assets: [] });
  await tick(0);
  const play = root.querySelector<HTMLButtonElement>('[data-tour-play]')!;
  play.click();
  await tick(100);
  await tick(100);
  await tick(100);
  expect(root.dataset['slideId']).toBe('end');
  expect(play.disabled).toBe(false);
  play.click();
  await tick(0);
  expect(root.dataset['slideId']).toBe('first');
  expect(root.querySelector<HTMLButtonElement>('[data-tour-previous]')!.disabled).toBe(true);
});
it('gates playback on decoded current media, ignores stale loads and permits retry after failure', async () => {
  const { player, root } = await mount();
  const tick = playbackFrames();
  const pending: { onload: (() => void) | null; onerror: (() => void) | null; src: string }[] = [];
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
  const input = authoringInput();
  input.tour.slides.forEach((slide) => {
    slide.timing = { ...slide.timing, mode: 'manual', holdSeconds: 0.1 };
  });
  const first = input.tour.slides[0]!;
  if (first.kind !== 'image') throw new Error('Expected image');
  first.hotspots[0]!.action = { kind: 'next' };
  player.update(input);
  const viewport = root.querySelector<HTMLElement>('[data-tour-viewport]')!;
  Object.defineProperty(viewport, 'clientWidth', { value: 500, configurable: true });
  window.dispatchEvent(new Event('resize'));
  expect(root.querySelector<HTMLElement>('[data-tour-scene]')!.inert).toBe(true);
  const stale = pending[0]!.onload!;
  const play = root.querySelector<HTMLButtonElement>('[data-tour-play]')!;
  play.click();
  await tick(1000);
  expect(root.dataset['slideId']).toBe('first');
  player.select('second');
  stale();
  await tick(0);
  await tick(1000);
  expect(root.dataset['slideId']).toBe('second');
  expect(play.textContent).toBe('Play');
  player.select('first');
  pending.at(-1)!.onerror!();
  await tick(0);
  expect(play.textContent).toBe('Retry');
  Object.defineProperty(viewport, 'clientWidth', { value: 400, configurable: true });
  window.dispatchEvent(new Event('resize'));
  expect(root.querySelector<HTMLElement>('[data-tour-hint]')!.inert).toBe(true);
  expect(root.querySelector<HTMLElement>('[data-tour-scene]')!.inert).toBe(true);
  play.click();
  pending.at(-1)!.onload!();
  await tick(0);
  await tick(100);
  expect(root.dataset['slideId']).toBe('second');
});

it('autoplay waits on URL choices and never treats a link as a timed destination', async () => {
  const { player, root } = await mount();
  const tick = playbackFrames();
  const tour = shortTour();
  const timing = tour.slides[0]!.timing;
  tour.slides[0] = {
    kind: 'navigation',
    id: 'first',
    title: '',
    description: '',
    background: { color: '#000000', image: null },
    buttons: [
      { id: 'url', label: 'External', action: { kind: 'url', url: 'https://example.com/' } },
    ],
    narration: null,
    timing,
  };
  player.update({ tour, labels, assets: [] });
  await tick(0);
  root.querySelector<HTMLButtonElement>('[data-tour-play]')!.click();
  await tick(100);
  expect(root.dataset['slideId']).toBe('first');
  expect(root.querySelector('[role=status]')!.textContent).toBe('Choose a destination');
  expect(root.querySelector('a')!.getAttribute('rel')).toBe('noopener noreferrer');
});
it('wraps the physical end only when loop is enabled and otherwise stops without an end screen', async () => {
  const { player, root } = await mount();
  const tick = playbackFrames();
  const tour = shortTour();
  tour.slides = [tour.slides[0]!];
  tour.endScreen.enabled = false;
  player.update({ tour, labels, assets: [] });
  await tick(0);
  const play = root.querySelector<HTMLButtonElement>('[data-tour-play]')!;
  play.click();
  await tick(100);
  expect(play.textContent).toBe('Play');
  tour.playback.loop = true;
  player.update({ tour, labels, assets: [] });
  await tick(0);
  play.click();
  await tick(100);
  await tick(50);
  expect(play.textContent).toBe('Pause');
  expect(root.dataset['slideId']).toBe('first');
});

it('keeps seek local on a branch with an explicit default while autoplay still follows that default', async () => {
  const { player, root } = await mount();
  const tick = playbackFrames();
  const tour = shortTour();
  const timing = { ...tour.slides[0]!.timing, autoplayTarget: 'second' };
  tour.slides[0] = {
    kind: 'navigation',
    id: 'first',
    title: '',
    description: '',
    background: { color: '#000000', image: null },
    buttons: [
      { id: 'b', label: 'B', action: { kind: 'slide', slideId: 'second' } },
      { id: 'c', label: 'C', action: { kind: 'slide', slideId: 'third' } },
    ],
    narration: null,
    timing,
  };
  player.update({ tour, labels, assets: [] });
  await tick(0);
  const seek = root.querySelector<HTMLInputElement>('[data-tour-seek]')!;
  expect(seek.max).toBe('100');
  root.querySelector<HTMLButtonElement>('[data-tour-play]')!.click();
  await tick(100);
  expect(root.dataset['slideId']).toBe('second');
  expect(seek.max).toBe('100');
  player.select('third');
  await tick(0);
  expect(seek.value).toBe('0');
});

it('animates manual entrance and pauses or resumes it through the transport clock', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const tick = playbackFrames();
  const { player, root } = await mount();
  const tour = shortTour();
  tour.transition = { kind: 'fade', durationMs: 100, hotspotTravelMs: 0 };
  player.update({ tour, labels, assets: [] });
  await tick(0);
  const scene = root.querySelector<HTMLElement>('[data-tour-scene]')!;
  const play = root.querySelector<HTMLButtonElement>('[data-tour-play]')!;
  await tick(50);
  expect(root.querySelector<HTMLElement>('.tour-motion-previous')!.style.opacity).toBe('0.5');
  expect(play.textContent).toBe('Pause');
  play.click();
  await tick(1000);
  expect(root.querySelector<HTMLElement>('.tour-motion-previous')!.style.opacity).toBe('0.5');
  play.click();
  await tick(50);
  expect(scene.inert).toBe(false);
  await tick(100);
  expect(root.dataset['slideId']).toBe('second');
  player.select('third');
  await tick(0);
  await tick(100);
  await tick(1000);
  expect(root.dataset['slideId']).toBe('third');
  expect(play.textContent).toBe('Play');
});
it('seeks a stable paused entrance frame and cancels transient geometry on actual resize', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const tick = playbackFrames();
  const { player, root } = await mount();
  const tour = shortTour();
  tour.transition = { kind: 'slide', durationMs: 100, hotspotTravelMs: 0 };
  player.update({ tour, labels, assets: [] });
  await tick(0);
  await tick(100);
  const seek = root.querySelector<HTMLInputElement>('[data-tour-seek]')!;
  seek.value = '0';
  seek.dispatchEvent(new Event('input', { bubbles: true }));
  const scene = root.querySelector<HTMLElement>('[data-tour-scene]')!;
  expect(root.querySelector<HTMLElement>('.tour-motion-previous')!.style.opacity).toBe('1');
  expect(scene.inert).toBe(true);
  await tick(1000);
  expect(root.querySelector<HTMLElement>('.tour-motion-previous')!.style.opacity).toBe('1');
  const viewport = root.querySelector<HTMLElement>('[data-tour-viewport]')!;
  Object.defineProperty(viewport, 'clientWidth', { value: 500, configurable: true });
  window.dispatchEvent(new Event('resize'));
  expect(scene.inert).toBe(false);
  expect(scene.style.opacity).toBe('');
  expect(root.querySelector('.tour-motion-previous')).toBeNull();
  player.select('second');
  player.select('third');
  await tick(0);
  await tick(100);
  expect(root.dataset['slideId']).toBe('third');
  expect(scene.inert).toBe(false);
  player.dispose();
  await tick(1000);
  expect(root.querySelector('.tour-motion-previous')).toBeNull();
});

it('repaginates explanations when text size changes without changing the stage dimensions', async () => {
  const { player, root } = await mount({
    authoring: { onSelectObject: vi.fn(), onMoveObject: vi.fn() },
  });
  player.update(authoringInput());
  const scene = root.querySelector('[data-tour-scene]')!;
  const previous = scene.firstElementChild;
  root.style.fontSize = '32px';
  window.dispatchEvent(new Event('resize'));
  expect(scene.firstElementChild).not.toBe(previous);
});
it('settles a live reduced-motion change without silently starting continuous playback', async () => {
  let change = () => {};
  const preference = {
    matches: false,
    addEventListener(_name: string, listener: () => void) {
      change = listener;
    },
  };
  vi.stubGlobal('matchMedia', () => preference);
  const tick = playbackFrames();
  const { player, root } = await mount();
  const tour = shortTour();
  tour.transition = { kind: 'fade', durationMs: 100, hotspotTravelMs: 0 };
  player.update({ tour, labels, assets: [] });
  await tick(0);
  await tick(50);
  preference.matches = true;
  change();
  await tick(0);
  const scene = root.querySelector<HTMLElement>('[data-tour-scene]')!;
  expect(scene.inert).toBe(false);
  expect(scene.style.opacity).toBe('');
  expect(root.querySelector<HTMLInputElement>('[data-tour-seek]')!.max).toBe('300');
  expect(root.querySelector('[data-tour-play]')!.textContent).toBe('Play');
  player.dispose();
  change();
  await tick(1000);
  expect(scene.children).toHaveLength(0);
});

it('keeps manual navigation paused when an entrance frame overshoots the entire slide', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const tick = playbackFrames();
  const { player, root } = await mount();
  const tour = shortTour();
  tour.transition = { kind: 'fade', durationMs: 100, hotspotTravelMs: 0 };
  player.update({ tour, labels, assets: [] });
  await tick(0);
  await tick(250);
  expect(root.dataset['slideId']).toBe('first');
  expect(root.querySelector('[data-tour-play]')!.textContent).toBe('Play');
  expect(root.querySelector<HTMLInputElement>('[data-tour-seek]')!.value).toBe('100');
});

it.each(['loading', 'error'])(
  'preserves %s admission through a live motion preference change',
  async (status) => {
    let change = () => {};
    const preference = {
      matches: false,
      addEventListener(_name: string, listener: () => void) {
        change = listener;
      },
    };
    vi.stubGlobal('matchMedia', () => preference);
    const tick = playbackFrames();
    const { player, root } = await mount();
    const images: { onerror: (() => void) | null }[] = [];
    vi.stubGlobal(
      'Image',
      class {
        onerror = null;
        constructor() {
          images.push(this);
        }
      }
    );
    player.update(authoringInput());
    if (status === 'error') images.at(-1)!.onerror!();
    await tick(0);
    preference.matches = true;
    change();
    expect(root.querySelector<HTMLElement>('[data-tour-scene]')!.inert).toBe(true);
    expect(root.querySelector<HTMLElement>('[data-tour-hint]')!.inert).toBe(true);
  }
);

it('shows navigation primary text directly in a compact centered composition', async () => {
  const { player, root } = await mount();
  const tour = createTourDocument('tour');
  tour.slides = [
    {
      kind: 'navigation',
      id: 'menu',
      title: 'Start here',
      description: 'Choose your next task.',
      background: { color: '#111827', image: null },
      buttons: [{ id: 'begin', label: 'Begin', action: { kind: 'end' } }],
      narration: null,
      timing: createTourImageSlide('unused').timing,
    },
  ];
  player.update({ tour, labels, assets: [] });
  expect(root.querySelector('.tour-navigation-text')?.textContent).toBe('Choose your next task.');
  expect(root.querySelector('.tour-navigation-scene .tour-details')).toBeNull();
  const content = root.querySelector<HTMLElement>('.tour-navigation-content');
  expect(content?.style.textAlign).toBe('center');
  expect(
    root.querySelector<HTMLElement>('.tour-navigation-buttons')?.style.gridTemplateColumns
  ).toBe('repeat(1, minmax(0, 1fr))');
});

it('keeps every navigation link reachable across unequal text page heights', async () => {
  const { player, root } = await mount();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      const text = this.querySelector<HTMLElement>('.tour-navigation-text');
      const textHeight = text?.style.height
        ? parseFloat(text.style.height)
        : (text?.textContent?.length ?? 0) > 80
          ? 96
          : 20;
      return new DOMRect(0, 0, 400, this.matches('.tour-navigation-content') ? 40 + textHeight : 0);
    }
  );
  const tour = createTourDocument('tour');
  tour.slides = [
    {
      kind: 'navigation',
      id: 'menu',
      title: 'Menu',
      description: 'A'.repeat(170),
      background: { color: '#111827', image: null },
      narration: null,
      timing: createTourImageSlide('unused').timing,
      buttons: Array.from({ length: 13 }, (_, index) => ({
        id: `item-${index}`,
        label: `Item ${index}`,
        action: { kind: 'end' },
      })),
    },
  ];
  player.update({ tour, labels, assets: [] });
  const visited = new Set<string>();
  for (let page = 0; page < 20; page += 1) {
    root
      .querySelectorAll('.tour-navigation-buttons button')
      .forEach((node) => visited.add(node.textContent ?? ''));
    const next = root.querySelectorAll<HTMLButtonElement>('.tour-navigation-pager button')[1];
    if (!next || next.disabled) break;
    next.click();
  }
  expect(visited.size).toBe(13);
});
