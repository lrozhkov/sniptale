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
  end: 'End of tour',
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

async function mount(endEnabled = true) {
  const tour = createTourDocument('tour');
  tour.endScreen.enabled = endEnabled;
  tour.slides = [createTourImageSlide('first'), createTourImageSlide('second')];
  tour.slides[0]!.title = 'First';
  tour.slides[1]!.title = 'Second';
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
  expect(items).toHaveLength(3);
  expect(items[0]!.getAttribute('aria-current')).toBe('step');
  expect(items.map((item) => item.textContent)).toEqual(['1. First', '2. Second', 'End of tour']);
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

it('selects the technical end and preserves its history identity across slide count updates', async () => {
  const { root, player, tour } = await mount();
  const trigger = root.querySelector<HTMLButtonElement>('[data-tour-contents]')!;
  const select = (index: number) => {
    trigger.click();
    root.querySelectorAll<HTMLButtonElement>('.tour-contents-list button')[index]!.click();
  };
  select(2);
  expect(root.dataset['slideId']).toBe('end');
  expect(document.activeElement).toBe(trigger);
  trigger.click();
  const rows = root.querySelectorAll<HTMLButtonElement>('.tour-contents-list button');
  expect([...rows].filter((row) => row.hasAttribute('aria-current'))).toEqual([rows[2]]);
  expect(document.activeElement).toBe(rows[2]);
  rows[0]!.click();
  const expanded = { ...tour, slides: [...tour.slides, createTourImageSlide('third')] };
  player.update({ tour: expanded, labels, assets: [] });
  root.querySelector<HTMLButtonElement>('[data-tour-previous]')!.click();
  expect(root.dataset['slideId']).toBe('end');
  root.querySelector<HTMLButtonElement>('[data-tour-previous]')!.click();
  expect(root.dataset['slideId']).toBe('first');
});

it('omits disabled end and skips retained end history when the feature is disabled', async () => {
  const { root, player, tour } = await mount();
  const trigger = root.querySelector<HTMLButtonElement>('[data-tour-contents]')!;
  const select = (index: number) => {
    trigger.click();
    root.querySelectorAll<HTMLButtonElement>('.tour-contents-list button')[index]!.click();
  };
  select(2);
  select(1);
  player.update({
    tour: { ...tour, endScreen: { ...tour.endScreen, enabled: false } },
    labels,
    assets: [],
  });
  trigger.click();
  expect(root.querySelectorAll('.tour-contents-list button')).toHaveLength(2);
  trigger.click();
  root.querySelector<HTMLButtonElement>('[data-tour-previous]')!.click();
  expect(root.dataset['slideId']).toBe('first');
  player.selectEnd();
  expect(root.dataset['slideId']).toBe('first');
});

function departureFrames() {
  let now = 0;
  let id = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (key: number) => frames.delete(key));
  return async (delta: number) => {
    now += delta;
    const queued = [...frames.values()];
    frames.clear();
    queued.forEach((callback) => callback(now));
    await Promise.resolve();
    await Promise.resolve();
  };
}
async function animatedTour() {
  const tick = departureFrames();
  const h = await mount();
  h.tour.transition = { kind: 'none', durationMs: 0, hotspotTravelMs: 0 };
  h.tour.slides = ['first', 'second', 'third'].map((id) => ({
    ...createTourImageSlide(id),
    masks: [
      {
        id: `mask-${id}`,
        kind: 'highlight' as const,
        color: '#ff0000',
        opacity: 0.5,
        rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
        highlightAnimation: {
          enter: { kind: 'none' as const, durationMs: 250 },
          exit: { kind: 'fade' as const, durationMs: 300 },
        },
      },
    ],
  }));
  h.player.update({ tour: h.tour, labels, assets: [] });
  await tick(0);
  return {
    ...h,
    tick,
    click: (name: string) =>
      h.root.querySelector<HTMLButtonElement>(`[data-tour-${name}]`)!.click(),
  };
}
it('projects consecutive Space destinations during exit and records only the actual departing slide', async () => {
  const h = await animatedTour();
  const space = () =>
    h.root.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    );
  space();
  expect(h.root.dataset['slideId']).toBe('first');
  await h.tick(100);
  space();
  await h.tick(300);
  expect(h.root.dataset['slideId']).toBe('third');
  h.click('previous');
  await h.tick(300);
  expect(h.root.dataset['slideId']).toBe('first');
});
it('keeps history intact when a pending Previous is cancelled by visibility', async () => {
  const h = await animatedTour();
  h.click('next');
  await h.tick(300);
  h.click('next');
  await h.tick(300);
  expect(h.root.dataset['slideId']).toBe('third');
  h.click('previous');
  await h.tick(100);
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  document.dispatchEvent(new Event('visibilitychange'));
  await h.tick(1000);
  expect(h.root.dataset['slideId']).toBe('third');
  hidden.mockReturnValue(false);
  h.click('previous');
  await h.tick(300);
  expect(h.root.dataset['slideId']).toBe('second');
});
it('lets Contents replace a pending target and cancels departure on document update', async () => {
  const h = await animatedTour();
  h.click('next');
  await h.tick(100);
  h.click('contents');
  h.root.querySelectorAll<HTMLButtonElement>('.tour-contents-list button')[2]!.click();
  await h.tick(300);
  expect(h.root.dataset['slideId']).toBe('third');
  h.click('previous');
  await h.tick(100);
  h.player.update({ tour: h.tour, labels, assets: [] });
  await h.tick(1000);
  expect(h.root.dataset['slideId']).toBe('third');
});
it('cancels pending exit before full-view reflow and restores alpha without changing manual mode', async () => {
  vi.stubGlobal(
    'Image',
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
      decode() {
        return Promise.resolve();
      }
    }
  );
  const h = await animatedTour();
  const first = h.tour.slides[0]!;
  if (first.kind !== 'image') throw new Error('Expected image slide');
  first.image = {
    assetId: 'image',
    width: 400,
    height: 200,
    alt: '',
    galleryAssetId: null,
    editDocumentId: null,
    source: { kind: 'import', filename: 'image.png' },
  };
  first.camera = { mode: 'manual', zoom: 3, center: { x: 0.5, y: 0.5 } };
  const assets = [{ id: 'image', src: 'data:image/png;base64,AA==' }];
  h.player.update({ tour: h.tour, labels, assets });
  await h.tick(0);
  await h.tick(0);
  const effect = () => h.root.querySelector<HTMLElement>('.tour-mask-effect')!;
  const base = Number(effect().style.opacity);
  expect(base).toBe(0.5);
  h.click('next');
  await h.tick(150);
  expect(Number(effect().style.opacity)).toBeLessThan(base);
  const fullView = h.root.querySelector<HTMLButtonElement>('[data-tour-full-view]')!;
  expect(fullView.disabled).toBe(false);
  fullView.click();
  expect(fullView.getAttribute('aria-pressed')).toBe('true');
  expect(Number(effect().style.opacity)).toBe(base);
  await h.tick(1000);
  expect(h.root.dataset['slideId']).toBe('first');
  h.root.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
  await h.tick(300);
  expect(h.root.dataset['slideId']).toBe('second');
});
it('seeks across slides immediately while retaining the actual source in Back history', async () => {
  const h = await animatedTour();
  const seek = h.root.querySelector<HTMLInputElement>('[data-tour-seek]')!;
  seek.value = seek.max;
  seek.dispatchEvent(new Event('input', { bubbles: true }));
  expect(h.root.dataset['slideId']).toBe('third');
  await h.tick(0);
  h.click('previous');
  await h.tick(300);
  expect(h.root.dataset['slideId']).toBe('first');
});
it('selects the current Contents row without replacing its rendered scene or replaying entry', async () => {
  const h = await animatedTour();
  const frame = h.root.querySelector('[data-tour-scene]')!.firstChild;
  h.click('contents');
  h.root.querySelectorAll<HTMLButtonElement>('.tour-contents-list button')[0]!.click();
  await h.tick(1000);
  expect(h.root.dataset['slideId']).toBe('first');
  expect(h.root.querySelector('[data-tour-scene]')!.firstChild).toBe(frame);
  expect(h.root.querySelector<HTMLButtonElement>('[data-tour-previous]')!.disabled).toBe(true);
});
