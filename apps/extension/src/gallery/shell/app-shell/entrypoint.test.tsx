// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const galleryIndexMocks = vi.hoisted(() => ({
  PageBootstrapErrorBoundaryMock: vi.fn(),
  renderPageShellMock: vi.fn(),
}));

vi.mock('../../../ui/page-bootstrap', () => ({
  PageBootstrapErrorBoundary: galleryIndexMocks.PageBootstrapErrorBoundaryMock,
  renderPageShell: galleryIndexMocks.renderPageShellMock,
}));

vi.mock('.', () => ({
  GalleryApp: () => null,
}));

describe('gallery index entrypoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('renders gallery through the shared page shell', async () => {
    await import('../../index');

    expect(galleryIndexMocks.renderPageShellMock).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: 'GalleryEntrypoint',
      })
    );
  });
});
