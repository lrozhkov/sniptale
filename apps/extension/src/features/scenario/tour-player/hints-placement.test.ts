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
  slide.hotspots = [
    {
      ...slide.hotspots[0]!,
      appearance: {
        presentation: 'callout',
        alignment: 'start',
        placement: 'right',
      },
    },
  ];
  player.update(input);
  const anchorX = Number.parseFloat(root.querySelector<HTMLElement>('.tour-hotspot')!.style.left);
  expect(Number.parseFloat(hint.style.left)).toBe(anchorX + 30);
});
