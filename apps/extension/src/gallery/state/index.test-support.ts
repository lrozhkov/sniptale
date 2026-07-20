import type { Mock } from 'vitest';

export function createItem(overrides: Record<string, unknown> = {}) {
  const id = typeof overrides['id'] === 'string' ? overrides['id'] : 'asset-1';

  return {
    id,
    entityId: id,
    kind: 'screenshot' as const,
    source: { kind: 'screenshot' as const },
    filename: 'preview.png',
    originalFilename: 'preview.png',
    createdAt: 1,
    updatedAt: 2,
    size: 100,
    mimeType: 'image/png',
    width: 1280,
    height: 720,
    duration: null,
    sourceUrl: null,
    sourceTitle: null,
    sourceFavicon: null,
    tags: ['alpha'],
    hasThumbnail: false,
    type: 'media' as const,
    ...overrides,
  };
}

export function configureSelectorMocks(mocks: {
  getActiveStorageBarClassMock: Mock;
  getAllGalleryTagsMock: Mock;
  getFilteredGalleryItemsMock: Mock;
  getGalleryCountsMock: Mock;
  getGalleryGridMetricsMock: Mock;
}) {
  mocks.getActiveStorageBarClassMock.mockReturnValue('storage-normal');
  mocks.getAllGalleryTagsMock.mockReturnValue(['alpha', 'beta']);
  mocks.getFilteredGalleryItemsMock.mockReturnValue([createItem()]);
  mocks.getGalleryCountsMock.mockReturnValue({
    all: 2,
    export: 0,
    recording: 0,
    scenario: 1,
    screenshot: 2,
  });
  mocks.getGalleryGridMetricsMock.mockReturnValue({
    columnCount: 3,
    startRow: 0,
    totalRows: 1,
    visibleItems: [createItem()],
  });
}
