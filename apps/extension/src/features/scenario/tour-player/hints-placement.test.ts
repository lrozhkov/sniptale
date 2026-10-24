// @vitest-environment jsdom
import {
  getTourHotspots,
  getTourAnnotations,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTourDocument } from '../project/factories';
import { createTourActionSlide as createTourImageSlide } from './test-support';
import { buildTourPlayerTestHtml as buildTourPlayerHtml } from './test-support';
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
  slide.actions = [
    ...slide.actions.filter(
      (entry) => entry.type !== 'hotspot' && !entry.object.id.endsWith('-action')
    ),
    ...[
      {
        id: 'point',
        point: { x: 0.5, y: 0.5 },
        targetRect: null,
        label: 'Open',
        text: 'Text',
        appearance: null,
        visual: { kind: 'point' as const, pulse: false },
      },
    ].map((object) => ({ type: 'hotspot' as const, object })),
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

/** Callout placement lives with the hint owner; the shared gap constant covers every side. */
it('keeps an automatic callout within the letterboxed stage when no side fits', async () => {
  const { player, root } = await mount();
  const viewport = root.querySelector('[data-tour-viewport]')!;
  const hint = root.querySelector<HTMLElement>('[data-tour-hint]')!;
  Object.defineProperties(viewport, { clientWidth: { value: 608 }, clientHeight: { value: 620 } });
  Object.defineProperties(hint, { offsetWidth: { value: 340 }, offsetHeight: { value: 200 } });
  player.update(authoringInput());
  const top = Number.parseFloat(hint.style.top);
  const left = Number.parseFloat(hint.style.left);
  expect(top).toBeGreaterThanOrEqual((620 - 342) / 2 + 8);
  expect(top + 200).toBeLessThanOrEqual((620 - 342) / 2 + 342 - 8);
  expect(left).toBeGreaterThanOrEqual(8);
  expect(left + 340).toBeLessThanOrEqual(608 - 8);
});

it('places a right callout at the shared anchor gap', async () => {
  const { player, root } = await mount();
  const viewport = root.querySelector('[data-tour-viewport]')!;
  const hint = root.querySelector<HTMLElement>('[data-tour-hint]')!;
  Object.defineProperties(viewport, { clientWidth: { value: 608 }, clientHeight: { value: 620 } });
  Object.defineProperties(hint, { offsetWidth: { value: 100 }, offsetHeight: { value: 50 } });
  const input = authoringInput();
  const slide = input.tour.slides[0]!;
  if (slide.kind !== 'image') throw new Error('Expected image slide');
  slide.actions = [
    ...slide.actions.filter(
      (entry) => entry.type !== 'hotspot' && !entry.object.id.endsWith('-action')
    ),
    ...[
      {
        ...getTourHotspots(slide)[0]!,
        appearance: {
          presentation: 'callout' as const,
          alignment: 'start' as const,
          placement: 'right' as const,
        },
      },
    ].map((object) => ({ type: 'hotspot' as const, object })),
  ];
  player.update(input);
  const anchorX = Number.parseFloat(root.querySelector<HTMLElement>('.tour-hotspot')!.style.left);
  expect(Number.parseFloat(hint.style.left)).toBe(anchorX + 30);
});

it.each([320, 640])(
  'keeps legacy and inherited point captions anchored at width %s',
  async (width) => {
    const { player, root } = await mount();
    const viewport = root.querySelector('[data-tour-viewport]')!;
    Object.defineProperties(viewport, {
      clientWidth: { value: width },
      clientHeight: { value: 360 },
    });
    const input = authoringInput();
    const slide = input.tour.slides[0]!;
    if (slide.kind !== 'image') throw new Error('Expected image slide');
    const hotspot = getTourHotspots(slide)[0]!;
    const hint = root.querySelector<HTMLElement>('[data-tour-hint]')!;
    for (const presentation of ['caption-top', 'caption-bottom'] as const) {
      input.tour.style.textAppearance.presentation = presentation;
      hotspot.appearance = null;
      player.update(input);
      expect(hint.dataset['presentation']).toBe('callout');
      expect(Number.parseFloat(hint.style.width)).toBeLessThan(width);
      hotspot.appearance = {
        presentation,
        alignment: 'center' as const,
        placement: 'right' as const,
      };
      player.update(input);
      expect(hint.dataset['presentation']).toBe('callout');
      expect(hint.style.textAlign).toBe('center');
      expect(root.querySelector<HTMLElement>('[data-tour-hint-toggle]')!.hidden).toBe(true);
    }
  }
);

it('keeps a legacy anchored annotation at the slide edge independently of the action point', async () => {
  const { player, root } = await mount();
  const input = authoringInput();
  const slide = input.tour.slides[0]!;
  if (slide.kind !== 'image') throw new Error('Expected image slide');
  slide.actions = [
    ...slide.actions.filter(
      (entry) => entry.type !== 'annotation' && !entry.object.id.endsWith('-action')
    ),
    ...[
      {
        id: 'note',
        text: 'Independent note',
        anchor: { x: 0.1, y: 0.2 },
        appearance: {
          presentation: 'callout' as const,
          placement: 'left' as const,
          alignment: 'end' as const,
        },
      },
    ].map((object) => ({ type: 'annotation' as const, object })),
  ];
  player.update(input);
  const hint = root.querySelector<HTMLElement>('[data-tour-hint]')!;
  expect(hint.dataset['presentation']).toBe('callout');
  root.querySelector<HTMLButtonElement>('[data-tour-hint-next]')!.click();
  expect(hint.dataset['presentation']).toBe('caption-bottom');
  expect(root.querySelector('[data-tour-hint-text]')!.textContent).toBe('Independent note');
  root.querySelector<HTMLButtonElement>('[data-tour-hint-previous]')!.click();
  expect(hint.dataset['presentation']).toBe('callout');
  expect(root.querySelector('[data-tour-hint-text]')!.textContent).toBe('Text');
});

it.each(['left', 'right', 'top', 'bottom'] as const)(
  'uses authored callout distance from the point center on %s',
  async (placement) => {
    const { player, root } = await mount();
    const viewport = root.querySelector('[data-tour-viewport]')!;
    const hint = root.querySelector<HTMLElement>('[data-tour-hint]')!;
    Object.defineProperties(viewport, {
      clientWidth: { value: 1000 },
      clientHeight: { value: 700 },
    });
    Object.defineProperties(hint, { offsetWidth: { value: 100 }, offsetHeight: { value: 50 } });
    const input = authoringInput();
    const slide = input.tour.slides[0]!;
    if (slide.kind !== 'image') throw new Error('Expected image slide');
    getTourHotspots(slide)[0]!.appearance = {
      presentation: 'callout' as const,
      alignment: 'start' as const,
      placement,
    };
    Object.assign(getTourHotspots(slide)[0]!.appearance!, { calloutGap: 80 });
    player.update(input);
    const marker = root.querySelector<HTMLElement>('.tour-hotspot')!;
    const x = Number.parseFloat(marker.style.left);
    const y = Number.parseFloat(marker.style.top) + (700 - 562.5) / 2;
    const left = Number.parseFloat(hint.style.left);
    const top = Number.parseFloat(hint.style.top);
    expect(
      placement === 'left'
        ? x - left - 100
        : placement === 'right'
          ? left - x
          : placement === 'top'
            ? y - top - 50
            : top - y
    ).toBe(80);
  }
);

it('inherits global gap, applies a local gap, and restores the default without changing captions', async () => {
  const { player, root } = await mount();
  const viewport = root.querySelector('[data-tour-viewport]')!;
  const hint = root.querySelector<HTMLElement>('[data-tour-hint]')!;
  Object.defineProperties(viewport, { clientWidth: { value: 1000 }, clientHeight: { value: 700 } });
  Object.defineProperties(hint, { offsetWidth: { value: 100 }, offsetHeight: { value: 50 } });
  const input = authoringInput();
  const slide = input.tour.slides[0]!;
  if (slide.kind !== 'image') throw new Error('Expected image slide');
  input.tour.style.hotspotAppearance = {
    presentation: 'callout' as const,
    placement: 'right' as const,
    alignment: 'start' as const,
    calloutGap: 70,
  };
  const markerGap = () =>
    Number.parseFloat(hint.style.left) -
    Number.parseFloat(root.querySelector<HTMLElement>('.tour-hotspot')!.style.left);
  player.update(input);
  expect(markerGap()).toBe(70);
  getTourHotspots(slide)[0]!.appearance = {
    ...input.tour.style.hotspotAppearance,
    calloutGap: 100,
  };
  player.update(input);
  expect(markerGap()).toBe(100);
  getTourHotspots(slide)[0]!.appearance = null;
  player.update(input);
  expect(markerGap()).toBe(70);
  slide.actions = [
    ...slide.actions.filter(
      (entry) => entry.type !== 'annotation' && !entry.object.id.endsWith('-action')
    ),
    ...[
      {
        id: 'caption',
        text: 'Caption',
        anchor: null,
        appearance: {
          presentation: 'caption-bottom' as const,
          placement: 'auto' as const,
          alignment: 'start' as const,
          calloutGap: 0,
        },
      },
    ].map((object) => ({ type: 'annotation' as const, object })),
  ];
  player.update(input);
  root.querySelector<HTMLButtonElement>('[data-tour-hint-next]')!.click();
  const position = { top: hint.style.top, left: hint.style.left };
  getTourAnnotations(slide)[0]!.appearance!.calloutGap = 120;
  player.update(input);
  root.querySelector<HTMLButtonElement>('[data-tour-hint-next]')!.click();
  expect({ top: hint.style.top, left: hint.style.left }).toEqual(position);
});

it.each(['annotation', 'hotspot'] as const)(
  'retains hidden hints on the next %s action until the explicit toggle',
  async (kind) => {
    const { player, root } = await mount();
    const input = authoringInput();
    const slide = input.tour.slides[0]!;
    if (slide.kind !== 'image') throw new Error('Expected image slide');
    const point = slide.actions[0]!;
    slide.actions = [
      {
        type: 'annotation',
        object: { id: 'intro', text: 'Introduction', anchor: null, appearance: null },
      },
      kind === 'hotspot'
        ? point
        : {
            type: 'annotation',
            object: { id: 'next-note', text: 'Next instruction', anchor: null, appearance: null },
          },
    ];
    player.update(input);
    const hint = root.querySelector<HTMLElement>('[data-tour-hint]')!;
    expect(hint.hidden).toBe(false);
    expect(root.querySelector('[data-tour-hint-text]')?.textContent).toBe('Introduction');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(hint.hidden).toBe(true);
    if (kind === 'hotspot') root.querySelector<HTMLButtonElement>('[data-tour-next]')!.click();
    else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(root.dataset['slideId']).toBe('first');
    expect(root.dataset['actionId']).toBe(kind === 'hotspot' ? 'point' : 'next-note');
    expect(hint.hidden).toBe(true);
    root.querySelector<HTMLButtonElement>('[data-tour-hints]')!.click();
    expect(hint.hidden).toBe(false);
    expect(root.querySelector('[data-tour-hint-text]')?.textContent).toBe(
      kind === 'hotspot' ? 'Text' : 'Next instruction'
    );
    window.dispatchEvent(new Event('resize'));
    expect(hint.hidden).toBe(false);
  }
);

it('keeps a bottom caption anchored beneath floating toolbar controls without changing stage geometry', async () => {
  const { player, root } = await mount();
  const viewport = root.querySelector<HTMLElement>('[data-tour-viewport]')!;
  const hint = root.querySelector<HTMLElement>('[data-tour-hint]')!;
  const toolbar = root.querySelector<HTMLElement>('.tour-toolbar')!;
  vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 640, 360));
  vi.spyOn(toolbar, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 300, 440, 48));
  Object.defineProperties(viewport, { clientWidth: { value: 640 }, clientHeight: { value: 360 } });
  Object.defineProperties(hint, { offsetWidth: { value: 640 }, offsetHeight: { value: 80 } });
  const input = authoringInput();
  const slide = input.tour.slides[0]!;
  if (slide.kind !== 'image') throw new Error('Expected image slide');
  slide.actions = [
    {
      type: 'annotation',
      object: {
        id: 'caption',
        text: 'Caption beneath controls',
        anchor: null,
        appearance: null,
      },
    },
  ];
  player.update(input);
  expect(hint.hidden).toBe(false);
  expect(Number.parseFloat(hint.style.bottom)).toBe(0);
  const dimensions = root.querySelector<HTMLElement>('[data-tour-stage]')!.style.cssText;
  const toggle = root.querySelector<HTMLButtonElement>('[data-tour-hints]')!;
  toggle.click();
  expect(hint.hidden).toBe(true);
  window.dispatchEvent(new Event('resize'));
  expect(hint.hidden).toBe(true);
  toggle.click();
  expect(hint.hidden).toBe(false);
  expect(Number.parseFloat(hint.style.bottom)).toBe(0);
  expect(root.querySelector<HTMLElement>('[data-tour-stage]')!.style.cssText).toBe(dimensions);
});

it('budgets short portrait callout text above the toolbar while retaining navigation space', async () => {
  const { root, player } = await mount();
  const viewport = root.querySelector<HTMLElement>('[data-tour-viewport]')!;
  const hint = root.querySelector<HTMLElement>('[data-tour-hint]')!;
  const text = root.querySelector<HTMLElement>('[data-tour-hint-text]')!;
  const toolbar = root.querySelector<HTMLElement>('.tour-toolbar')!;
  Object.defineProperties(root, { clientWidth: { value: 320 }, clientHeight: { value: 280 } });
  Object.defineProperties(viewport, { clientWidth: { value: 146 }, clientHeight: { value: 260 } });
  vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(new DOMRect(87, 10, 146, 260));
  vi.spyOn(toolbar, 'getBoundingClientRect').mockReturnValue(new DOMRect(12, 188, 296, 80));
  Object.defineProperties(hint, {
    offsetWidth: { value: 128 },
    offsetHeight: { get: () => Math.min(220, parseFloat(hint.style.maxHeight) || 220) },
  });
  Object.defineProperty(hint.querySelector('.tour-hint-header')!, 'offsetHeight', { value: 32 });
  Object.defineProperty(hint.querySelector('.tour-hint-controls')!, 'offsetHeight', { value: 32 });
  const input = authoringInput();
  input.tour.stage.aspect = '9:16';
  const slide = input.tour.slides[0]!;
  if (slide.kind !== 'image') throw new Error('Expected image slide');
  slide.actions[0]!.object.text = 'Long explanation '.repeat(40);
  player.update(input);
  expect(parseFloat(hint.style.top) + hint.offsetHeight).toBeLessThanOrEqual(170);
  expect(parseFloat(text.style.maxHeight)).toBeGreaterThan(0);
  expect(parseFloat(text.style.maxHeight)).toBeLessThan(80);
  const stage = root.querySelector<HTMLElement>('[data-tour-stage]')!;
  const size = [stage.style.width, stage.style.height];
  window.dispatchEvent(new Event('resize'));
  expect([stage.style.width, stage.style.height]).toEqual(size);
});
