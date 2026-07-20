import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  translateMock: vi.fn((key: string) => `translated:${key}`),
}));

vi.mock('../../../platform/i18n', () => ({
  translate: mocks.translateMock,
}));

import { createMediaHubListener } from './media-hub-listener';

function createParams() {
  return {
    refreshGalleryStatus: vi.fn(async () => undefined),
    setGalleryStatus: vi.fn(),
  };
}

beforeEach(() => {
  mocks.translateMock.mockClear();
});

describe('createMediaHubListener', () => {
  it('refreshes gallery status when the library changes', () => {
    const params = createParams();

    createMediaHubListener(() => params)({ type: 'library-changed' });

    expect(params.refreshGalleryStatus).toHaveBeenCalledTimes(1);
    expect(params.setGalleryStatus).not.toHaveBeenCalled();
  });

  it('marks non-library events as attention states', () => {
    const params = createParams();

    createMediaHubListener(() => params)({ type: 'storage-pressure' });

    expect(params.setGalleryStatus).toHaveBeenCalledWith({
      pressure: 'critical',
      text: 'translated:popup.common.galleryStatusAttention',
    });
  });
});
