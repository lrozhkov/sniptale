import { beforeEach, describe, expect, it, vi } from 'vitest';

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

function setupSceneMocks() {
  vi.clearAllMocks();
  mocks.getSourceObjectMock.mockReturnValue(null);
  mocks.resolveEditorSceneLayoutMock.mockReturnValue({
    canvas: { height: 260, width: 420 },
    source: { height: 100, left: 40, top: 60, width: 200 },
  });
}

function runNullRelayoutSuite() {
  it('returns null when the scene cannot be relaid out', () => {
    expect(
      relayoutEditorScene(
        null,
        { displayHeight: 20, displayWidth: 10 } as never,
        { height: 20, width: 10 },
        createFrame() as never,
        createBrowserFrame() as never
      )
    ).toBeNull();
  });
}

function runUserObjectRelayoutSuite() {
  it('rescales user objects and falls back to the resolved layout source state', () => {
    const userObject = {
      kind: 'user',
      left: 20,
      scaleX: 1,
      scaleY: 1,
      set: vi.fn(),
      setCoords: vi.fn(),
      top: 30,
    };
    const frameObject = {
      kind: 'frame',
      set: vi.fn(),
      setCoords: vi.fn(),
    };
    const canvas = {
      getObjects: () => [userObject, frameObject],
    };

    const result = relayoutEditorScene(
      canvas as never,
      createSourceState() as never,
      { height: 70, width: 120 },
      createFrame() as never,
      createBrowserFrame() as never
    );

    expect(userObject.set).toHaveBeenCalledWith({
      left: 60,
      scaleX: 2,
      scaleY: 2,
      top: 80,
    });
    expect(userObject.setCoords).toHaveBeenCalledOnce();
    expect(frameObject.set).not.toHaveBeenCalled();
    expect(result).toEqual({
      canvasSize: { height: 260, width: 420 },
      source: expect.objectContaining({
        displayHeight: 100,
        displayWidth: 200,
        left: 40,
        top: 60,
      }),
    });
  });
}

function runBackgroundRelayoutGuardSuite() {
  it('refreshes managed gradient backgrounds to the new canvas bounds during relayout', () => {
    const backgroundObject = {
      kind: 'user',
      sniptaleBackgroundMode: 'gradient',
      sniptaleRole: 'background',
      sniptaleType: 'background',
      set: vi.fn(),
      setCoords: vi.fn(),
    };
    const canvas = {
      getObjects: () => [backgroundObject],
    };

    relayoutEditorScene(
      canvas as never,
      createSourceState() as never,
      { height: 70, width: 120 },
      {
        ...createFrame(),
        backgroundMode: 'gradient',
      } as never,
      createBrowserFrame() as never
    );

    expect(backgroundObject.set).toHaveBeenCalledWith(
      expect.objectContaining({
        fill: expect.objectContaining({ type: 'linear' }),
        height: 260,
        left: 0,
        top: 0,
        width: 420,
      })
    );
    expect(backgroundObject.setCoords).toHaveBeenCalledOnce();
  });
}

function runSourceObjectRelayoutSuite() {
  it('uses the actual source object metrics when the relayout updates the source layer', () => {
    mocks.getSourceObjectMock.mockReturnValue({
      getScaledHeight: vi.fn(() => 210),
      getScaledWidth: vi.fn(() => 320),
      left: 12,
      sniptaleId: 'next-source',
      sniptaleLocked: false,
      top: 14,
      visible: false,
    });

    const result = relayoutEditorScene(
      { getObjects: () => [] } as never,
      createSourceState() as never,
      { height: 70, width: 120 },
      createFrame() as never,
      createBrowserFrame() as never,
      {
        fitSourceToContent: true,
        preserveCanvasSize: false,
        sourceSize: { height: 300, width: 400 },
      }
    );

    expect(mocks.resolveEditorSceneLayoutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fitSourceToContent: true,
        preserveCanvasSize: false,
        source: { height: 300, width: 400 },
      })
    );
    expect(result?.source).toEqual(
      expect.objectContaining({
        displayHeight: 210,
        displayWidth: 320,
        id: 'next-source',
        left: 12,
        locked: false,
        top: 14,
        visible: false,
      })
    );
  });
}

describe('editor-controller-scene', () => {
  beforeEach(setupSceneMocks);
  runNullRelayoutSuite();
  runUserObjectRelayoutSuite();
  runBackgroundRelayoutGuardSuite();
  runSourceObjectRelayoutSuite();
});
