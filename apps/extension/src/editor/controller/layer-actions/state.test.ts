import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findObjectByIdMock: vi.fn(),
  isEditableObjectMock: vi.fn(() => true),
  isTextboxMock: vi.fn(() => false),
  isUserObjectMock: vi.fn(() => true),
  normalizeScaledAnnotationTargetMock: vi.fn(() => false),
  normalizeScaledRectangleTargetMock: vi.fn(() => false),
  resizeTextCalloutMock: vi.fn(),
}));

vi.mock('fabric', () => ({
  ActiveSelection: class ActiveSelection {
    objects: unknown[];
    constructor(objects: unknown[]) {
      this.objects = objects;
    }
  },
}));

vi.mock('../document/layers', async () => ({
  ...(await vi.importActual<typeof import('../document/layers')>('../document/layers')),
  findObjectById: mocks.findObjectByIdMock,
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

vi.mock('../../objects', async () => ({
  ...(await vi.importActual<typeof import('../../objects')>('../../objects')),
}));

vi.mock('../../objects/shape-style', async () => ({
  ...(await vi.importActual<typeof import('../../objects/shape-style')>(
    '../../objects/shape-style'
  )),
  normalizeScaledRectangleTarget: mocks.normalizeScaledRectangleTargetMock,
}));

vi.mock('../../objects/annotation/text/callout/resize', async () => ({
  ...(await vi.importActual<typeof import('../../objects/annotation/text/callout/resize')>(
    '../../objects/annotation/text/callout/resize'
  )),
  resizeTextCallout: mocks.resizeTextCalloutMock,
}));

vi.mock('../tools/annotation-resize', () => ({
  normalizeScaledAnnotationTarget: mocks.normalizeScaledAnnotationTargetMock,
}));

import { toggleLayerLock } from './state/lock';
import { resizeLayerObject } from './state/resize';
import { selectLayerObject } from './state/selection';
import { toggleLayerVisibility } from './state/visibility';

function createObject(id: string, overrides: Record<string, unknown> = {}) {
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

function createCanvas(
  objects: ReturnType<typeof createObject>[],
  activeObjects: ReturnType<typeof createObject>[] = []
) {
  let activeObject = activeObjects[0] ?? null;
  return {
    discardActiveObject: vi.fn(() => {
      activeObject = null;
    }),
    getActiveObject: vi.fn(() => activeObject),
    getActiveObjects: vi.fn(() => activeObjects),
    getObjects: vi.fn(() => objects),
    requestRenderAll: vi.fn(),
    setActiveObject: vi.fn((object) => {
      activeObject = object;
    }),
  };
}

function registerSelectionStateTest() {
  it('supports range selection and toggle removal through canvas-owned selection state', () => {
    const first = createObject('first');
    const second = createObject('second');
    const third = createObject('third');
    const ensureObjectReachable = vi.fn(() => true);
    const focusObjectInViewport = vi.fn();
    const canvas = createCanvas([first, second, third], [first]);

    expect(
      selectLayerObject(
        canvas as never,
        'third',
        { anchorId: 'first', range: true },
        ensureObjectReachable,
        focusObjectInViewport
      )
    ).toBe(true);
    expect(canvas.setActiveObject).toHaveBeenCalledWith(
      expect.objectContaining({ objects: [first, second, third] })
    );

    expect(
      selectLayerObject(
        createCanvas([first, second, third], [first]) as never,
        'first',
        { toggle: true },
        ensureObjectReachable,
        focusObjectInViewport
      )
    ).toBe(true);
  });

  it('suppresses viewport focusing when layer auto navigation is disabled', () => {
    const target = createObject('layer-1');
    const ensureObjectReachable = vi.fn(() => true);
    const focusObjectInViewport = vi.fn();

    expect(
      selectLayerObject(
        createCanvas([target]) as never,
        'layer-1',
        { focusViewport: false },
        ensureObjectReachable,
        focusObjectInViewport
      )
    ).toBe(true);
    expect(focusObjectInViewport).not.toHaveBeenCalled();
  });
}

function registerToggleStateTest() {
  it('toggles visibility and lock state only for user-owned layers', () => {
    const target = createObject('layer-1');
    const canvas = createCanvas([target], [target]);
    const prepareObject = vi.fn();
    mocks.findObjectByIdMock.mockReturnValue(target);

    expect(toggleLayerVisibility(canvas as never, 'layer-1')).toBe(target);
    expect(target.visible).toBe(false);
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();

    expect(toggleLayerLock(canvas as never, 'layer-1', prepareObject)).toBe(target);
    expect(target.sniptaleLocked).toBe(true);
    expect(prepareObject).toHaveBeenCalledWith(target);
  });

  it('keeps locked layer visibility immutable while still allowing unlock', () => {
    const target = createObject('layer-1', { sniptaleLocked: true });
    const canvas = createCanvas([target], [target]);
    const prepareObject = vi.fn();
    mocks.findObjectByIdMock.mockReturnValue(target);

    expect(toggleLayerVisibility(canvas as never, 'layer-1')).toBeNull();
    expect(target.visible).toBe(true);
    expect(toggleLayerLock(canvas as never, 'layer-1', prepareObject)).toBe(target);
    expect(target.sniptaleLocked).toBe(false);
  });
}

function registerPrimaryResizeStateTest() {
  it('routes text and rectangle resizes through their authoritative owners', () => {
    const text = createObject('text-1', { sniptaleType: 'text' });
    const rectangle = createObject('rectangle-1', {
      sniptaleRole: 'annotation',
      sniptaleType: 'rectangle',
    });
    const ensureObjectReachable = vi.fn(() => true);

    mocks.findObjectByIdMock.mockReturnValueOnce(text);
    mocks.isTextboxMock.mockReturnValueOnce(true);
    expect(
      resizeLayerObject(createCanvas([text]) as never, 'text-1', 180, 60, ensureObjectReachable)
    ).toBe(text);
    expect(mocks.resizeTextCalloutMock).toHaveBeenCalledWith(text, 180, 60);

    mocks.findObjectByIdMock.mockReturnValueOnce(rectangle);
    mocks.normalizeScaledRectangleTargetMock.mockReturnValueOnce(true);
    expect(
      resizeLayerObject(
        createCanvas([rectangle]) as never,
        'rectangle-1',
        200,
        80,
        ensureObjectReachable
      )
    ).toBe(rectangle);
    expect(mocks.normalizeScaledRectangleTargetMock).toHaveBeenCalledWith(rectangle);
    expect(rectangle.setCoords).toHaveBeenCalled();

    const locked = createObject('locked', { sniptaleLocked: true });
    mocks.findObjectByIdMock.mockReturnValueOnce(locked);
    expect(
      resizeLayerObject(createCanvas([locked]) as never, 'locked', 10, 10, ensureObjectReachable)
    ).toBeNull();
  });
}

function registerFallbackResizeStateTest() {
  it('uses non-raster annotation fallback only when rectangle normalization does not apply', () => {
    const pencil = createObject('pencil-1', { sniptaleType: 'pencil' });
    const ensureObjectReachable = vi.fn(() => true);

    mocks.findObjectByIdMock.mockReturnValueOnce(pencil);
    mocks.normalizeScaledAnnotationTargetMock.mockReturnValueOnce(true);

    expect(
      resizeLayerObject(createCanvas([pencil]) as never, 'pencil-1', 200, 80, ensureObjectReachable)
    ).toBe(pencil);
    expect(mocks.normalizeScaledRectangleTargetMock).toHaveBeenCalledWith(pencil);
    expect(mocks.normalizeScaledAnnotationTargetMock).toHaveBeenCalledWith(pencil);
    expect(pencil.setCoords).toHaveBeenCalledOnce();
  });
}

function runLayerActionsStateSuite() {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isEditableObjectMock.mockReturnValue(true);
    mocks.isTextboxMock.mockReturnValue(false);
    mocks.isUserObjectMock.mockReturnValue(true);
    mocks.normalizeScaledAnnotationTargetMock.mockReturnValue(false);
    mocks.normalizeScaledRectangleTargetMock.mockReturnValue(false);
  });
  registerSelectionStateTest();
  registerToggleStateTest();
  registerPrimaryResizeStateTest();
  registerFallbackResizeStateTest();
}

describe('layer actions state seam', runLayerActionsStateSuite);
