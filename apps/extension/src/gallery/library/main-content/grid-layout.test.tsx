// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createMediaItem,
  createVideoProjectItem,
  createGridMetricsFixture,
} from '../test-support/items';
import { GRID_GAP } from '../constants';
import { getGalleryGridLayout } from '../grid-layout';
import { GalleryGridCanvas } from './grid-cards';

vi.mock('../ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ui')>()),
  MediaThumb: () => <div data-ui="test.thumb" />,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const metrics = (
  items: Parameters<typeof createGridMetricsFixture>[0]['items'],
  gridWidth: number,
  viewMode: 'compact-grid' | 'large-grid',
  columnCount: number
) => createGridMetricsFixture({ items, gridWidth, viewMode, columnCount });

it.each(['compact-grid', 'large-grid'] as const)(
  'gives project and image cards the same landscape geometry in %s',
  (viewMode) => {
    const image = createMediaItem({ id: 'image' });
    const project = createVideoProjectItem();
    const layout = getGalleryGridLayout({
      columnCount: 1,
      gridWidth: viewMode === 'compact-grid' ? 220 : 320,
      items: [image, project],
      viewMode,
    });
    expect(layout.rowHeights[0]).toBe(layout.rowHeights[1]);
    expect(layout.rowHeights[0]).toBe(
      Math.ceil(layout.cardWidth * (9 / 16) + (viewMode === 'compact-grid' ? 40 : 72))
    );
  }
);

it.each([
  ['compact-grid', 220, 40, false],
  ['large-grid', 320, 72, false],
  ['compact-grid', 220, 40, true],
  ['large-grid', 320, 72, true],
] as const)(
  'keeps ordinary %s width %i previews with %ipx details (trash=%s)',
  (viewMode, width, footer, trashMode) => {
    const item = createMediaItem({ id: 'ordinary' });
    act(() =>
      root.render(
        <GalleryGridCanvas
          trashMode={trashMode}
          filteredItems={[item]}
          gridMetrics={metrics([item], width, viewMode, 1)}
          gridWidth={width}
          onPreviewOpen={vi.fn()}
          onToggleSelection={vi.fn()}
          selectedIds={new Set()}
          viewMode={viewMode}
          visibleItems={[item]}
        />
      )
    );
    const card = container.querySelector<HTMLElement>('article');
    expect(card?.style.height).toBe(`${Math.ceil((width * 9) / 16 + footer)}px`);
  }
);

it('places mixed rows at the image-card pitch', () => {
  const ordinary = createMediaItem({ id: 'ordinary' });
  const project = createVideoProjectItem();
  const next = createMediaItem({ id: 'next' });
  const items = [ordinary, project, next];
  const gridMetrics = metrics(items, 500, 'compact-grid', 2);

  act(() =>
    root.render(
      <GalleryGridCanvas
        filteredItems={items}
        gridMetrics={gridMetrics}
        gridWidth={500}
        onPreviewOpen={vi.fn()}
        onToggleSelection={vi.fn()}
        selectedIds={new Set()}
        viewMode="compact-grid"
        visibleItems={items}
      />
    )
  );

  const cards = container.querySelectorAll<HTMLElement>('article');
  const ordinaryHeight = Number.parseFloat(cards?.[0]?.style.height ?? '');
  const projectHeight = Number.parseFloat(cards?.[1]?.style.height ?? '');
  const nextTop = Number.parseFloat(cards?.[2]?.style.top ?? '');
  expect(ordinaryHeight).toBe(projectHeight);
  expect(nextTop).toBe(ordinaryHeight + GRID_GAP);
  expect(Number.parseFloat(cards?.[2]?.style.height ?? '')).toBe(ordinaryHeight);
});
