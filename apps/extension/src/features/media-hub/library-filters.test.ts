import { describe, expect, it } from 'vitest';
import {
  getLibraryFacetValue,
  matchesLibraryFilters,
  type LibraryFilterItem,
  type LibraryFacetFilters,
} from './library-filters';
const now = new Date(2026, 8, 7, 12).getTime();
const item: LibraryFilterItem = {
  filename: 'Demo.WEBM',
  mimeType: 'video/webm',
  size: 102400,
  width: 1920,
  height: 1080,
  duration: 60,
  sourceUrl: 'https://www.example.com/demo',
  createdAt: now,
  updatedAt: now,
  tags: ['demo'],
};
const empty: LibraryFacetFilters = {
  created: [],
  updated: [],
  format: [],
  size: [],
  resolution: [],
  duration: [],
  source: [],
};
describe('library facet boundaries', () => {
  it.each([
    [0, '0:102400'],
    [102399, '0:102400'],
    [102400, '102400:524288'],
    [524288, '524288:1048576'],
    [1048576, '1048576:10485760'],
    [10485760, '10485760:104857600'],
    [104857600, '104857600:infinity'],
  ] as const)('classifies size %s', (size, expected) =>
    expect(getLibraryFacetValue({ ...item, size }, 'size', now)).toBe(expected)
  );
  it.each([
    [null, null],
    [0, 'under-minute'],
    [59.99, 'under-minute'],
    [60, '1-5-minutes'],
    [300, '5-30-minutes'],
    [1800, 'over-30-minutes'],
  ] as const)('classifies duration %s', (duration, expected) =>
    expect(getLibraryFacetValue({ ...item, duration }, 'duration', now)).toBe(expected)
  );
  it.each([
    [0, null],
    [1279, 'compact'],
    [1280, 'hd'],
    [1920, 'full-hd'],
    [2560, 'qhd'],
    [3840, 'uhd'],
  ] as const)('classifies resolution %s', (width, expected) =>
    expect(getLibraryFacetValue({ ...item, width, height: 720 }, 'resolution', now)).toBe(expected)
  );
  it.each([
    [0, 'today'],
    [1, 'yesterday'],
    [7, 'days-2-7'],
    [8, 'days-8-30'],
    [30, 'days-8-30'],
    [31, 'this-year'],
    [365, 'older'],
  ] as const)('uses local calendar boundaries %s', (days, expected) => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - days);
    expect(getLibraryFacetValue({ ...item, createdAt: date.getTime() }, 'created', now)).toBe(
      expected
    );
  });
  it('uses filename format with MIME fallback and normalized hostnames', () => {
    expect(getLibraryFacetValue(item, 'format', now)).toBe('webm');
    expect(
      getLibraryFacetValue({ ...item, filename: 'untitled', mimeType: 'image/png' }, 'format', now)
    ).toBe('png');
    expect(getLibraryFacetValue(item, 'source', now)).toBe('example.com');
    expect(getLibraryFacetValue({ ...item, sourceUrl: 'bad url' }, 'source', now)).toBeNull();
  });
  it('matches tags and values with OR, facets and scope with AND', () => {
    const filters = {
      activeTags: ['missing', 'demo'],
      facetFilters: { ...empty, format: ['png', 'webm'], resolution: ['full-hd'] },
      scope: 'library' as const,
    };
    expect(matchesLibraryFilters(item, filters, now)).toBe(true);
    expect(matchesLibraryFilters({ ...item, tags: [] }, filters, now)).toBe(false);
    expect(matchesLibraryFilters({ ...item, width: 1280 }, filters, now)).toBe(false);
    expect(
      matchesLibraryFilters({ ...item, lifecycle: { storageClass: 'temporary' } }, filters, now)
    ).toBe(false);
    expect(
      matchesLibraryFilters(
        { ...item, lifecycle: { storageClass: 'temporary' } },
        { ...filters, scope: 'all' },
        now
      )
    ).toBe(true);
  });
});
