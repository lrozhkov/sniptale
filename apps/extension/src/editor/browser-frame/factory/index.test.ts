import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BROWSER_FRAME_STATE } from '../../../features/editor/document/constants';

const mocks = vi.hoisted(() => ({
  fabricImageFromUrlMock: vi.fn(),
  renderExactBrowserFrameToDataUrlMock: vi.fn(),
  getFabricImageIntrinsicSizeMock: vi.fn(),
}));

vi.mock('fabric', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fabric')>();

  return {
    ...actual,
    FabricImage: {
      fromURL: mocks.fabricImageFromUrlMock,
    },
  };
});

vi.mock('../../document/model', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../document/model')>();

  return {
    ...actual,
    getFabricImageIntrinsicSize: mocks.getFabricImageIntrinsicSizeMock,
  };
});

vi.mock('./exact/renderer', () => ({
  renderExactBrowserFrameToDataUrl: mocks.renderExactBrowserFrameToDataUrlMock,
}));

import { BrowserFrameFactory } from './';

function createImageObject() {
  return {
    set: vi.fn(),
    setCoords: vi.fn(),
  };
}

function registerHeaderMockupTest() {
  it('creates a non-interactive browser header mockup from the exact renderer', async () => {
    const image = createImageObject();
    mocks.fabricImageFromUrlMock.mockResolvedValue(image);

    const result = await BrowserFrameFactory.createFrame({
      browserFrame: {
        ...DEFAULT_BROWSER_FRAME_STATE,
        title: 'Example <unsafe>',
        url: 'https://example.com/path',
      },
      source: { left: 40, top: 98, width: 320, height: 200 },
    });

    expect(result.objects).toEqual([image]);
    expect(result.sourceClipPath).toBeNull();
    expect(mocks.renderExactBrowserFrameToDataUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({
        height: BrowserFrameFactory.HEADER_HEIGHT,
        width: 320,
      })
    );
    expect(image.set).toHaveBeenCalledWith(
      expect.objectContaining({
        left: 40,
        top: 12,
        scaleX: 1,
      })
    );
    expect(image.set).toHaveBeenCalledWith(
      expect.objectContaining({
        evented: false,
        excludeFromExport: true,
        id: 'browser-frame-mockup',
        selectable: false,
      })
    );
    expect(image.setCoords).toHaveBeenCalledOnce();
  });
}

describe('browser-frame-factory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.renderExactBrowserFrameToDataUrlMock.mockResolvedValue('data:image/svg+xml,mockup');
    mocks.getFabricImageIntrinsicSizeMock.mockReturnValue({ width: 320, height: 288 });
  });

  registerHeaderMockupTest();
});
