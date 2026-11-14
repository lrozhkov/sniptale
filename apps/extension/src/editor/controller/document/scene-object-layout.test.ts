// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { updateUserObjectLayout } from './scene-object-layout';
import { Canvas, Textbox } from 'fabric';
import { createEditorDrawingFabricObject } from '../../drawing/object/vector';
import { readEditorDrawingObject } from '../../drawing/object/metadata';
import type { SourceState } from '../../document/model/source-state';

const mocks = vi.hoisted(() => ({
  isUserObject: vi.fn((object: { kind?: string }) => object.kind === 'user'),
}));

vi.mock('../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/model')>()),
  isUserObject: mocks.isUserObject,
}));

function createSourceState() {
  return {
    displayHeight: 50,
    displayWidth: 100,
    left: 10,
    top: 20,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('rescales user objects relative to the resolved source layout', () => {
  const userObject = {
    kind: 'user',
    left: 20,
    scaleX: 1,
    scaleY: 1,
    set: vi.fn(),
    setCoords: vi.fn(),
    top: 30,
  };

  updateUserObjectLayout({
    canvas: { getObjects: () => [userObject] } as never,
    currentSource: createSourceState() as never,
    layoutSource: { height: 100, left: 40, top: 60, width: 200 },
    sourceSizeChanged: true,
  });

  expect(userObject.set).toHaveBeenCalledWith({
    left: 60,
    scaleX: 2,
    scaleY: 2,
    top: 80,
  });
  expect(userObject.setCoords).toHaveBeenCalledOnce();
});

it('keeps browser-frame offsets while resolving source-size scale', () => {
  const browserFrame = {
    getScaledHeight: vi.fn(() => 86),
    getScaledWidth: vi.fn(() => 160),
    height: 86,
    kind: 'user',
    left: 18,
    sniptaleType: 'browser-frame',
    set: vi.fn(),
    setCoords: vi.fn(),
    top: 12,
    width: 160,
  };

  updateUserObjectLayout({
    canvas: { getObjects: () => [browserFrame] } as never,
    currentSource: createSourceState() as never,
    layoutSource: { height: 100, left: 40, top: 60, width: 200 },
    sourceSizeChanged: true,
  });

  expect(browserFrame.set).toHaveBeenCalledWith(
    expect.objectContaining({
      left: 48,
      scaleX: 1.25,
      top: 52,
    })
  );
  expect(browserFrame.setCoords).toHaveBeenCalledOnce();
});

it('keeps existing browser-frame scale when only source position changes', () => {
  const browserFrame = {
    getScaledHeight: vi.fn(() => 86),
    getScaledWidth: vi.fn(() => 160),
    height: 86,
    kind: 'user',
    left: 18,
    sniptaleType: 'browser-frame',
    set: vi.fn(),
    setCoords: vi.fn(),
    top: 12,
    width: 160,
  };

  updateUserObjectLayout({
    canvas: { getObjects: () => [browserFrame] } as never,
    currentSource: createSourceState() as never,
    layoutSource: { height: 100, left: 40, top: 60, width: 200 },
    sourceSizeChanged: false,
  });

  expect(browserFrame.set).toHaveBeenCalledWith(
    expect.objectContaining({
      scaleX: 1,
      scaleY: 1,
    })
  );
});

it('ignores non-user and managed background objects', () => {
  const nonUserObject = { kind: 'frame', set: vi.fn(), setCoords: vi.fn() };
  const backgroundObject = {
    kind: 'user',
    sniptaleRole: 'background',
    sniptaleType: 'background',
    set: vi.fn(),
    setCoords: vi.fn(),
  };

  updateUserObjectLayout({
    canvas: { getObjects: () => [nonUserObject, backgroundObject] } as never,
    currentSource: createSourceState() as never,
    layoutSource: { height: 100, left: 40, top: 60, width: 200 },
    sourceSizeChanged: true,
  });

  expect(nonUserObject.set).not.toHaveBeenCalled();
  expect(backgroundObject.set).not.toHaveBeenCalled();
});

it.each([undefined, Number.NaN, 0])(
  'uses safe geometry fallbacks for sparse user and browser-frame objects (%s)',
  (dimension) => {
    const sparseUserObject = {
      kind: 'user',
      left: 10,
      set: vi.fn(),
      setCoords: vi.fn(),
      top: 20,
    };
    const sparseBrowserFrame = {
      getScaledHeight: vi.fn(() => dimension),
      getScaledWidth: vi.fn(() => dimension),
      kind: 'user',
      sniptaleType: 'browser-frame',
      set: vi.fn(),
      setCoords: vi.fn(),
    };

    updateUserObjectLayout({
      canvas: { getObjects: () => [sparseUserObject, sparseBrowserFrame] } as never,
      currentSource: { ...createSourceState(), displayHeight: 0, displayWidth: 0 } as never,
      layoutSource: { height: 100, left: 40, top: 60, width: 200 },
      sourceSizeChanged: true,
    });

    expect(sparseUserObject.set).toHaveBeenCalledWith(
      expect.objectContaining({
        scaleX: 200,
        scaleY: 100,
      })
    );
    expect(sparseBrowserFrame.set).toHaveBeenCalledWith(
      expect.objectContaining({
        scaleX: 1,
        scaleY: 1,
      })
    );
  }
);

it.each([
  [true, 0],
  [true, 30],
  [false, 0],
  [false, 30],
] as const)(
  'preserves wrapping=%s and rotation=%s during scene layout',
  async (automatic, rotation) => {
    const canvas = new Canvas(document.createElement('canvas'), { renderOnAddRemove: false });
    const object = createEditorDrawingFabricObject(
      {
        id: 'scene-text',
        kind: 'text',
        text: 'Scene text',
        color: '#111111',
        backgroundColor: '#ff7f50',
        fontSize: 24,
        fontFamily: 'sans',
        autoWidth: automatic,
        wrapWidth: 240,
        rotation,
        bounds: { x: 30, y: 40, width: 200, height: 60 },
      },
      1
    );
    if (!(object instanceof Textbox)) throw new Error('Expected text');
    canvas.add(object);
    mocks.isUserObject.mockReturnValue(true);
    const center = object.getCenterPoint();
    const source: SourceState = {
      ...createSourceState(),
      id: 'source',
      dataUrl: '',
      name: null,
      intrinsicWidth: 100,
      intrinsicHeight: 50,
      visible: true,
      locked: true,
    };
    try {
      updateUserObjectLayout({
        canvas,
        currentSource: source,
        sourceSizeChanged: true,
        layoutSource: { left: 40, top: 60, width: 200, height: 100 },
      });
      const drawing = readEditorDrawingObject(object);
      expect(drawing).toMatchObject({ kind: 'text', fontSize: 48, autoWidth: automatic, rotation });
      expect(object.scaleX).toBe(1);
      expect(object.scaleY).toBe(1);
      if (rotation) {
        expect(object.getCenterPoint().x).toBeCloseTo(40 + (center.x - 10) * 2, 5);
        expect(object.getCenterPoint().y).toBeCloseTo(60 + (center.y - 20) * 2, 5);
      } else {
        expect(object.left).toBeCloseTo(80, 5);
        expect(object.top).toBeCloseTo(100, 5);
      }
      if (automatic) expect(object.sniptaleDrawingTextMaxWidth).toBe(480);
    } finally {
      await canvas.dispose();
      mocks.isUserObject.mockImplementation((object) => object.kind === 'user');
    }
  }
);
