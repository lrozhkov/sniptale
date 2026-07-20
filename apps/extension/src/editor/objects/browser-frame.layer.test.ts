import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fromUrlMock: vi.fn(),
  getFabricImageIntrinsicSizeMock: vi.fn(),
  renderExactBrowserFrameToDataUrlMock: vi.fn(),
}));

vi.mock('fabric', () => ({
  FabricImage: {
    fromURL: mocks.fromUrlMock,
  },
}));

vi.mock('../browser-frame/factory/exact/renderer', () => ({
  renderExactBrowserFrameToDataUrl: mocks.renderExactBrowserFrameToDataUrlMock,
}));

vi.mock('../document/model', async () => {
  const actual = await vi.importActual<typeof import('../document/model')>('../document/model');

  return {
    ...actual,
    getFabricImageIntrinsicSize: mocks.getFabricImageIntrinsicSizeMock,
  };
});

import { BROWSER_HEADER_HEIGHT, createObjectLabel } from '../document/model';
import { createBrowserFrameLayerObject } from './browser-frame';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.renderExactBrowserFrameToDataUrlMock.mockResolvedValue('data:image/png;base64,header');
  mocks.getFabricImageIntrinsicSizeMock.mockReturnValue({
    width: 200,
    height: BROWSER_HEADER_HEIGHT,
  });
});

function createRenderedImage() {
  const image = {
    sniptaleId: undefined,
    sniptaleLabel: undefined,
    sniptaleLocked: undefined,
    set: vi.fn(),
    setCoords: vi.fn(),
    visible: true,
  };
  mocks.fromUrlMock.mockResolvedValue(image);
  return image;
}

async function createLayer(
  overrides: Partial<Parameters<typeof createBrowserFrameLayerObject>[0]> = {}
) {
  const prepareObject = vi.fn();

  const prepared = await createBrowserFrameLayerObject({
    browserFrame: {
      canvasMode: 'resize',
      contentMode: 'push-down',
      title: 'Tab title',
      url: 'https://example.test',
    },
    existingObject: {
      sniptaleId: 'browser-frame-1',
      sniptaleLabel: 'Browser Header 1',
      sniptaleLocked: true,
      visible: false,
    } as never,
    left: 24,
    nextLabelIndex: 2,
    prepareObject,
    top: 16,
    width: 320,
    ...overrides,
  });

  return { prepareObject, prepared };
}

it('creates a browser-header layer object with preserved metadata', async () => {
  const image = createRenderedImage();
  const { prepareObject, prepared } = await createLayer();

  expect(mocks.renderExactBrowserFrameToDataUrlMock).toHaveBeenCalledWith(
    expect.objectContaining({
      width: 320,
      height: BROWSER_HEADER_HEIGHT,
      headerHeight: BROWSER_HEADER_HEIGHT,
    })
  );
  expect(image.set).toHaveBeenCalledWith({
    left: 24,
    top: 16,
    scaleX: 320 / 200,
    scaleY: 1,
  });
  expect(prepareObject).toHaveBeenCalledWith(image);
  expect(prepared.sniptaleId).toBe('browser-frame-1');
  expect(prepared.sniptaleLabel).toBe('Browser Header 1');
  expect(prepared.sniptaleLocked).toBe(true);
  expect(prepared.sniptaleRole).toBe('annotation');
  expect(prepared.sniptaleType).toBe('browser-frame');
  expect(prepared.visible).toBe(false);
  expect(image.setCoords).toHaveBeenCalledOnce();
});

it('creates a fresh browser-header layer when no previous object exists', async () => {
  const image = createRenderedImage();
  const uuidSpy = vi
    .spyOn(crypto, 'randomUUID')
    .mockReturnValue('11111111-1111-4111-8111-111111111111');

  try {
    const { prepared } = await createLayer({
      existingObject: null,
      nextLabelIndex: 4,
      width: 0.4,
    });

    expect(mocks.renderExactBrowserFrameToDataUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1 })
    );
    expect(image.set).toHaveBeenCalledWith(
      expect.objectContaining({
        scaleX: 1 / 200,
        scaleY: 1,
      })
    );
    expect(prepared.sniptaleId).toBe('11111111-1111-4111-8111-111111111111');
    expect(prepared.sniptaleLabel).toBe(createObjectLabel('browser-frame', 4));
    expect(prepared.sniptaleLocked).toBe(false);
    expect(prepared.visible).toBe(true);
  } finally {
    uuidSpy.mockRestore();
  }
});
