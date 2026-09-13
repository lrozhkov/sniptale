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
  'commits source-coordinate drag with auto zoom %s and cancels Escape',
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
      x: autoZoom ? 0.525 : 0.6,
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

it('places an automatic callout below its point when neither horizontal side has room', async () => {
  const { player, root } = await mount();
  const viewport = root.querySelector('[data-tour-viewport]')!;
  const hint = root.querySelector<HTMLElement>('[data-tour-hint]')!;
  Object.defineProperties(viewport, { clientWidth: { value: 608 }, clientHeight: { value: 620 } });
  Object.defineProperties(hint, { offsetWidth: { value: 340 }, offsetHeight: { value: 200 } });
  player.update(authoringInput());
  const marker = root.querySelector<HTMLElement>('.tour-hotspot')!;
  const pointY = (620 - 342) / 2 + Number.parseFloat(marker.style.top);
  expect(Number.parseFloat(hint.style.top)).toBeGreaterThan(pointY + 15);
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
