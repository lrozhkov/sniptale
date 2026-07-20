import { describe, expect, it, vi } from 'vitest';

import { configureSelectorMocks, createItem } from './index.test-support';

describe('gallery/state index test support', () => {
  it('creates gallery items with canonical defaults and override support', () => {
    expect(createItem()).toMatchObject({
      createdAt: 1,
      entityId: 'asset-1',
      filename: 'preview.png',
      kind: 'screenshot',
      tags: ['alpha'],
      type: 'media',
      width: 1280,
    });
    expect(createItem({ id: 'asset-9', tags: ['beta'] })).toMatchObject({
      entityId: 'asset-9',
      id: 'asset-9',
      tags: ['beta'],
    });
  });

  it('configures selector mocks with consistent gallery defaults', () => {
    const mocks = {
      getActiveStorageBarClassMock: vi.fn(),
      getAllGalleryTagsMock: vi.fn(),
      getFilteredGalleryItemsMock: vi.fn(),
      getGalleryCountsMock: vi.fn(),
      getGalleryGridMetricsMock: vi.fn(),
    };

    configureSelectorMocks(mocks);

    expect(mocks.getActiveStorageBarClassMock()).toBe('storage-normal');
    expect(mocks.getAllGalleryTagsMock()).toEqual(['alpha', 'beta']);
    expect(mocks.getFilteredGalleryItemsMock()).toEqual([
      expect.objectContaining({ id: 'asset-1' }),
    ]);
    expect(mocks.getGalleryCountsMock()).toEqual({
      all: 2,
      export: 0,
      recording: 0,
      scenario: 1,
      screenshot: 2,
    });
    expect(mocks.getGalleryGridMetricsMock()).toEqual({
      columnCount: 3,
      startRow: 0,
      totalRows: 1,
      visibleItems: [expect.objectContaining({ id: 'asset-1' })],
    });
  });
});
