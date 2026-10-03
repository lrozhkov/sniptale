import { expect, it } from 'vitest';
import { createMediaItem } from '../library/test-support/items';
import { createGalleryGridMetrics, getGalleryGridMetrics } from './selectors';

it('reuses geometry and visible items until the scroll window changes', () => {
  const items = Array.from({ length: 100 }, (_, i) => createMediaItem({ id: `item-${i}` }));
  const select = createGalleryGridMetrics({
    filteredItems: items,
    gridWidth: 800,
    viewMode: 'compact-grid',
  });
  const initial = select({ scrollTop: 0, viewportHeight: 400 });
  expect(select({ scrollTop: 1, viewportHeight: 400 })).toBe(initial);
  const scrolled = select({ scrollTop: 1800, viewportHeight: 400 });
  expect(scrolled).not.toBe(initial);
  expect(scrolled.rowTops).toBe(initial.rowTops);
  expect(scrolled.visibleItems).toEqual(
    getGalleryGridMetrics({
      filteredItems: items,
      gridWidth: 800,
      viewMode: 'compact-grid',
      scrollTop: 1800,
      viewportHeight: 400,
    }).visibleItems
  );
  expect(select({ scrollTop: 0, viewportHeight: 400 }).visibleItems).toEqual(initial.visibleItems);
});
