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

async function mount(layout: {
  width: number;
  align: 'start' | 'center' | 'end';
  columns: 1 | 2 | 3;
  gap: number;
  padding: number;
}) {
  const tour = createTourDocument('tour');
  const timing = createTourImageSlide('unused').timing;
  tour.slides = [
    {
      kind: 'navigation',
      id: 'menu',
      title: 'Start here',
      description: 'Choose your next task.',
      background: { color: '#111827', image: null },
      buttons: [
        { id: 'begin', label: 'Begin', action: { kind: 'end' } },
        { id: 'second', label: 'Second', action: { kind: 'end' } },
        { id: 'third', label: 'Third', action: { kind: 'end' } },
      ],
      narration: null,
      timing,
      layout: { vertical: 'center' as const, ...layout },
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

function measuredGrid(root: HTMLElement) {
  const buttons = root.querySelector<HTMLElement>('.tour-navigation-buttons')!;
  const match = /repeat\((\d+), ([\d.]+)px\)/.exec(buttons.style.gridTemplateColumns);
  if (!match) throw new Error(`Unexpected columns: ${buttons.style.gridTemplateColumns}`);
  return {
    buttons,
    columns: Number(match[1]),
    columnWidth: Number(match[2]),
    gridWidth: Number.parseFloat(buttons.style.width),
  };
}

/** One reference column width keeps buttons equal across 1, 2 and 3 authored columns. */
it('keeps one button width across 1, 2 and 3 columns and aligns the block', async () => {
  const widths: number[] = [];
  const alignments = ['flex-start', 'center', 'flex-end'];
  for (const [index, columns] of ([1, 2, 3] as const).entries()) {
    const layout = {
      width: 64,
      align: ['start', 'center', 'end'][index] as 'start' | 'center' | 'end',
      vertical: 'center' as const,
      padding: 6,
      gap: 12,
      columns,
    };
    const { player, root, tour } = await mount(layout);
    const viewport = root.querySelector('[data-tour-viewport]')!;
    Object.defineProperties(viewport, {
      clientWidth: { value: 1024 },
      clientHeight: { value: 576 },
    });
    player.update({ tour, labels, assets: [] });
    const grid = measuredGrid(root);
    expect(grid.columns).toBe(columns);
    widths.push(grid.columnWidth);
    expect(grid.buttons.style.alignSelf).toBe(alignments[index]);
    expect(grid.gridWidth).toBeCloseTo(grid.columnWidth * columns + 12 * (columns - 1), 5);
  }
  for (const width of widths) expect(width).toBeCloseTo(widths[0]!, 5);
  expect(widths[0]!).toBeGreaterThan(0);
});
