import type { Canvas } from 'fabric';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findObjectByIdMock: vi.fn(),
  getLayerObjectsMock: vi.fn(),
  isTextboxMock: vi.fn(() => false),
  isEditableObjectMock: vi.fn(() => true),
  isUserObjectMock: vi.fn(() => true),
}));

vi.mock('../document/layers', async () => ({
  ...(await vi.importActual<typeof import('../document/layers')>('../document/layers')),
  findObjectById: mocks.findObjectByIdMock,
  getLayerObjects: mocks.getLayerObjectsMock,
}));

vi.mock('../../document/model', async () => ({
  ...(await vi.importActual<typeof import('../../document/model')>('../../document/model')),
  isEditableObject: mocks.isEditableObjectMock,
  isUserObject: mocks.isUserObjectMock,
}));

vi.mock('../core/helpers', async () => ({
  ...(await vi.importActual<typeof import('../core/helpers')>('../core/helpers')),
  isTextbox: mocks.isTextboxMock,
}));

import {
  moveLayerSelection,
  moveLayerSelectionToEdge,
  reorderLayerObjects,
  resizeLayerObject,
  selectLayerObject,
  toggleLayerLock,
  toggleLayerVisibility,
} from './';

type LayerObject = {
  getScaledHeight: () => number;
  getScaledWidth: () => number;
  sniptaleId: string;
  sniptaleLocked: boolean;
  scaleX: number;
  scaleY: number;
  set: ReturnType<typeof vi.fn>;
  setCoords: ReturnType<typeof vi.fn>;
  visible: boolean;
} & Record<string, unknown>;

type LayerCanvas = Canvas & {
  bringObjectForward: ReturnType<typeof vi.fn>;
  bringObjectToFront: ReturnType<typeof vi.fn>;
  discardActiveObject: ReturnType<typeof vi.fn>;
  getActiveObject: ReturnType<typeof vi.fn>;
  getActiveObjects: ReturnType<typeof vi.fn>;
  getObjects: ReturnType<typeof vi.fn>;
  moveObjectTo: ReturnType<typeof vi.fn>;
  requestRenderAll: ReturnType<typeof vi.fn>;
  sendObjectBackwards: ReturnType<typeof vi.fn>;
  sendObjectToBack: ReturnType<typeof vi.fn>;
  setActiveObject: ReturnType<typeof vi.fn>;
};

function createObject(id: string, overrides: Record<string, unknown> = {}): LayerObject {
  return {
    getScaledHeight: () => 50,
    getScaledWidth: () => 100,
    sniptaleId: id,
    sniptaleLocked: false,
    scaleX: 1,
    scaleY: 1,
    set: vi.fn(function apply(this: Record<string, unknown>, payload: Record<string, unknown>) {
      Object.assign(this, payload);
    }),
    setCoords: vi.fn(),
    visible: true,
    ...overrides,
  };
}

function createCanvas(objects: LayerObject[], activeObjects: LayerObject[] = []): LayerCanvas {
  let activeObject: LayerObject | null = activeObjects[0] ?? null;

  return {
    bringObjectForward: vi.fn(),
    bringObjectToFront: vi.fn(),
    discardActiveObject: vi.fn(() => {
      activeObject = null;
    }),
    getActiveObject: vi.fn(() => activeObject),
    getActiveObjects: vi.fn(() => activeObjects),
    getObjects: vi.fn(() => objects),
    moveObjectTo: vi.fn(),
    requestRenderAll: vi.fn(),
    sendObjectBackwards: vi.fn(),
    sendObjectToBack: vi.fn(),
    setActiveObject: vi.fn((object) => {
      activeObject = object;
    }),
  } as unknown as LayerCanvas;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isEditableObjectMock.mockReturnValue(true);
  mocks.isTextboxMock.mockReturnValue(false);
  mocks.isUserObjectMock.mockReturnValue(true);
});

function runReorderSuite() {
  it('reorders layer objects using reversed layer order', () => {
    const first = createObject('first');
    const second = createObject('second');
    const third = createObject('third');
    const canvas = createCanvas([first, second, third]);
    mocks.getLayerObjectsMock.mockReturnValue([first, second, third]);

    expect(reorderLayerObjects(canvas, 'third', 'first')).toBe(true);
    expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(1, third, 0);
    expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(2, first, 1);
    expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(3, second, 2);
    expect(reorderLayerObjects(canvas, 'missing', 'first')).toBe(false);
    expect(reorderLayerObjects(canvas, 'first', 'first')).toBe(false);
  });
}

function runSelectionMovementSuite() {
  it('moves active editable selection forward, backward, and to edges', () => {
    const first = createObject('first');
    const second = createObject('second');
    const third = createObject('third');
    const canvas = createCanvas([first, second, third], [second, first]);

    expect(moveLayerSelection(canvas, 1)).toBe(true);
    expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(1, third, 0);
    expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(2, first, 1);
    expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(3, second, 2);
    canvas.moveObjectTo.mockClear();
    expect(moveLayerSelection(canvas, -1)).toBe(true);
    expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(1, first, 0);
    expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(2, second, 1);
    expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(3, third, 2);
    canvas.moveObjectTo.mockClear();
    const source = createObject('source', { sniptaleType: 'source-image' });
    const sourceBoundaryCanvas = createCanvas([source, first], [first]);
    expect(moveLayerSelection(sourceBoundaryCanvas, -1)).toBe(true);
    expect(sourceBoundaryCanvas.moveObjectTo).toHaveBeenNthCalledWith(1, source, 0);
    expect(sourceBoundaryCanvas.moveObjectTo).toHaveBeenNthCalledWith(2, first, 1);
    expect(moveLayerSelectionToEdge(canvas, 'front')).toBe(true);
    expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(1, third, 0);
    expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(2, first, 1);
    expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(3, second, 2);
    canvas.moveObjectTo.mockClear();
    expect(moveLayerSelectionToEdge(canvas, 'back')).toBe(true);
    expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(1, first, 0);
    expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(2, second, 1);
    expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(3, third, 2);
    expect(moveLayerSelection(createCanvas([first, second, third], []), 1)).toBe(false);
  });
}

function runSelectionFocusSuite() {
  it('selects a reachable layer object and syncs focus', () => {
    const target = createObject('layer-1');
    const other = createObject('layer-2');
    const canvas = createCanvas([target, other], [target]);
    const ensureObjectReachable = vi.fn(() => true);
    const focusObjectInViewport = vi.fn();

    expect(
      selectLayerObject(canvas, 'layer-1', {}, ensureObjectReachable, focusObjectInViewport)
    ).toBe(true);
    expect(canvas.setActiveObject).toHaveBeenCalledWith(target);
    expect(focusObjectInViewport).toHaveBeenCalledWith(target);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(
      selectLayerObject(canvas, 'missing', {}, ensureObjectReachable, focusObjectInViewport)
    ).toBeNull();
    expect(
      selectLayerObject(
        canvas,
        'layer-1',
        { toggle: true },
        ensureObjectReachable,
        focusObjectInViewport
      )
    ).toBe(true);
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(
      selectLayerObject(
        createCanvas([target, other], [target]),
        'layer-2',
        { range: true, anchorId: 'missing-anchor' },
        ensureObjectReachable,
        focusObjectInViewport
      )
    ).toBe(true);
    expect(canvas.requestRenderAll).toHaveBeenCalled();
  });
}

function runToggleLayerStateSuite() {
  it('toggles visibility and lock state for editable user objects', () => {
    const target = createObject('layer-1');
    const canvas = createCanvas([target], [target]);
    const prepareObject = vi.fn();
    mocks.findObjectByIdMock.mockReturnValue(target);

    expect(toggleLayerVisibility(canvas, 'layer-1')).toBe(target);
    expect(target.visible).toBe(false);
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();

    expect(toggleLayerLock(canvas, 'layer-1', prepareObject)).toBe(target);
    expect(target.sniptaleLocked).toBe(true);
    expect(prepareObject).toHaveBeenCalledWith(target);
  });
}

function runGenericResizeSuite() {
  it('resizes generic editable layer objects through scale deltas', () => {
    const target = createObject('layer-1');
    const canvas = createCanvas([target], [target]);
    const ensureObjectReachable = vi.fn(() => true);
    mocks.findObjectByIdMock.mockReturnValue(target);

    expect(resizeLayerObject(canvas, 'layer-1', 200.4, 25.2, ensureObjectReachable)).toBe(target);
    expect(target.scaleX).toBe(2);
    expect(target.scaleY).toBe(0.5);
    expect(target.set).toHaveBeenCalledWith(expect.objectContaining({ scaleX: 2, scaleY: 0.5 }));
    expect(target.setCoords).toHaveBeenCalledOnce();
    expect(ensureObjectReachable).toHaveBeenCalledWith(target);
    mocks.findObjectByIdMock.mockReturnValueOnce({
      ...target,
      getScaledWidth: () => 0,
    });
    expect(
      resizeLayerObject(createCanvas([target]), 'layer-1', 10, 10, ensureObjectReachable)
    ).toBeNull();
  });
}

function runTextResizeSuite() {
  it('resizes editor text layers through callout dimensions instead of object scaling', () => {
    const target = createObject('text-1', {
      getScaledHeight: () => 120,
      getScaledWidth: () => 420,
      height: 40,
      initDimensions: vi.fn(),
      sniptaleTextCalloutFormat: 'bubble',
      sniptaleTextCalloutHeight: 120,
      sniptaleTextCalloutWidth: 420,
      sniptaleType: 'text',
      padding: 10,
      scaleX: 2,
      scaleY: 0.5,
      width: 120,
    });
    const canvas = createCanvas([target], [target]);
    const ensureObjectReachable = vi.fn(() => true);
    mocks.findObjectByIdMock.mockReturnValue(target);
    mocks.isTextboxMock.mockReturnValue(true);

    expect(resizeLayerObject(canvas, 'text-1', 280, 48, ensureObjectReachable)).toBe(target);
    expect(target.scaleX).toBe(1);
    expect(target.scaleY).toBe(1);
    expect(target['sniptaleTextCalloutWidth']).toBe(280);
    expect(target['sniptaleTextCalloutHeight']).toBe(76);
    expect(target['width']).toBe(244);
    expect(target.setCoords).toHaveBeenCalledOnce();
    expect(ensureObjectReachable).toHaveBeenCalledWith(target);
  });
}

function runGuardSuite() {
  it('guards against null canvases and non-user objects', () => {
    const target = createObject('layer-1');
    mocks.findObjectByIdMock.mockReturnValue(target);
    mocks.isEditableObjectMock.mockReturnValue(false);
    mocks.isUserObjectMock.mockReturnValue(false);

    expect(moveLayerSelection(null, 1)).toBe(false);
    expect(moveLayerSelectionToEdge(null, 'front')).toBe(false);
    expect(selectLayerObject(null, 'layer-1', {}, vi.fn(), vi.fn())).toBeNull();
    expect(toggleLayerVisibility(null, 'layer-1')).toBeNull();
    expect(toggleLayerLock(null, 'layer-1', vi.fn())).toBeNull();
    expect(resizeLayerObject(null, 'layer-1', 100, 100, vi.fn())).toBeNull();
  });
}

describe('editor-controller-layer-actions', () => {
  runReorderSuite();
  runSelectionMovementSuite();
  runSelectionFocusSuite();
  runToggleLayerStateSuite();
  runGenericResizeSuite();
  runTextResizeSuite();
  runGuardSuite();
});
