import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSourceObjectMock: vi.fn(),
  isUserObjectMock: vi.fn((object: { kind?: string }) => object.kind === 'user'),
  resolveEditorSceneLayoutMock: vi.fn(),
}));

vi.mock('./layers', () => ({
  getSourceObject: mocks.getSourceObjectMock,
}));

vi.mock('../../browser-frame/layout', () => ({
  resolveEditorSceneLayout: mocks.resolveEditorSceneLayoutMock,
  shouldFitSourceToContent: vi.fn(() => false),
  shouldPreserveCanvasForBrowserFrame: vi.fn(() => true),
}));

vi.mock('../../document/model', async () => {
  const actual =
    await vi.importActual<typeof import('../../document/model')>('../../document/model');

  return {
    ...actual,
    isUserObject: mocks.isUserObjectMock,
  };
});

import { relayoutEditorScene } from './scene';

function createBrowserHeader() {
  return {
    getScaledHeight: vi.fn(() => 86),
    getScaledWidth: vi.fn(() => 160),
    height: 86,
    kind: 'user',
    left: 18,
    sniptaleType: 'browser-frame',
    scaleX: 1,
    scaleY: 1,
    set: vi.fn(),
    setCoords: vi.fn(),
    top: 12,
    width: 160,
  };
}

function createSourceState() {
  return {
    dataUrl: 'data:image/png;base64,abc',
    displayHeight: 50,
    displayWidth: 100,
    id: 'source-image-layer',
    intrinsicHeight: 50,
    intrinsicWidth: 100,
    left: 10,
    locked: true,
    name: 'source',
    top: 20,
    visible: true,
  };
}

function createFrame() {
  return {
    backgroundColor: '#fff',
    backgroundGradientAngle: 0,
    backgroundGradientFrom: '#fff',
    backgroundGradientTo: '#000',
    backgroundImageData: null,
    backgroundImageFit: 'cover',
    backgroundMode: 'color',
    browserMode: false,
    browserTitle: '',
    browserUrl: '',
    layoutMode: 'expand-canvas',
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 0,
  };
}

function createBrowserFrame() {
  return {
    canvasMode: 'resize-canvas',
    contentMode: 'push-down',
    enabled: false,
    title: '',
    url: '',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSourceObjectMock.mockReturnValue(null);
  mocks.resolveEditorSceneLayoutMock.mockReturnValue({
    canvas: { height: 260, width: 420 },
    source: { height: 100, left: 40, top: 60, width: 200 },
  });
});

function expectBrowserHeaderOffsetShift(browserHeader: ReturnType<typeof createBrowserHeader>) {
  expect(browserHeader.set).toHaveBeenCalledWith(
    expect.objectContaining({
      left: 48,
      top: 52,
    })
  );
}

it('keeps manual browser-header offsets while resetting width on source-size changes', () => {
  const browserHeader = createBrowserHeader();

  relayoutEditorScene(
    { getObjects: () => [browserHeader] } as never,
    createSourceState() as never,
    { height: 70, width: 120 },
    createFrame() as never,
    createBrowserFrame() as never,
    {
      sourceSize: { width: 300, height: 200 },
    }
  );

  expectBrowserHeaderOffsetShift(browserHeader);
  expect(mocks.resolveEditorSceneLayoutMock).toHaveBeenCalledWith(
    expect.objectContaining({ hasBrowserFrame: true })
  );
});

it('keeps the existing browser-header scale when only the source position changes', () => {
  const browserHeader = createBrowserHeader();

  relayoutEditorScene(
    { getObjects: () => [browserHeader] } as never,
    createSourceState() as never,
    { height: 70, width: 120 },
    createFrame() as never,
    createBrowserFrame() as never
  );

  expectBrowserHeaderOffsetShift(browserHeader);
  expect(browserHeader.set).toHaveBeenCalledWith(
    expect.objectContaining({
      scaleX: 1,
      scaleY: 1,
    })
  );
});

it('respects an explicit hasBrowserFrame override even when the layer is present', () => {
  const browserHeader = createBrowserHeader();

  relayoutEditorScene(
    { getObjects: () => [browserHeader] } as never,
    createSourceState() as never,
    { height: 70, width: 120 },
    createFrame() as never,
    createBrowserFrame() as never,
    {
      hasBrowserFrame: false,
      preserveCanvasSize: false,
      fitSourceToContent: true,
    }
  );

  expect(mocks.resolveEditorSceneLayoutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      fitSourceToContent: true,
      hasBrowserFrame: false,
      preserveCanvasSize: false,
    })
  );
});
