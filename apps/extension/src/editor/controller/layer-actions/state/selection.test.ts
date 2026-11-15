// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isEditableObjectMock: vi.fn(() => true),
}));

vi.mock('fabric', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fabric')>()),
  ActiveSelection: class ActiveSelection {
    objects: unknown[];

    constructor(objects: unknown[]) {
      this.objects = objects;
    }
  },
}));

vi.mock('../../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../document/model')>()),
  isEditableObject: mocks.isEditableObjectMock,
}));

import { Canvas, FabricImage } from 'fabric';
import { selectLayerObject } from './selection';

function createObject(id: string) {
  return { sniptaleId: id };
}

function createCanvas(
  objects: ReturnType<typeof createObject>[],
  activeObjects = objects.slice(0, 1)
) {
  return {
    discardActiveObject: vi.fn(),
    getActiveObjects: vi.fn(() => activeObjects),
    getObjects: vi.fn(() => objects),
    requestRenderAll: vi.fn(),
    setActiveObject: vi.fn(),
  };
}

function registerRangeSelectionTest() {
  it('builds range selections in canvas layer order', () => {
    const first = createObject('first');
    const second = createObject('second');
    const third = createObject('third');
    const canvas = createCanvas([first, second, third], [first]);

    expect(
      selectLayerObject(
        canvas as never,
        'third',
        { anchorId: 'first', range: true },
        vi.fn(() => true),
        vi.fn()
      )
    ).toBe(true);

    expect(canvas.setActiveObject).toHaveBeenCalledWith(
      expect.objectContaining({ objects: [first, second, third] })
    );
  });
}

function registerToggleSelectionTest() {
  it('toggles the only selected object off through canvas-owned selection state', () => {
    const first = createObject('first');
    const canvas = createCanvas([first], [first]);

    expect(
      selectLayerObject(
        canvas as never,
        'first',
        { toggle: true },
        vi.fn(() => true),
        vi.fn()
      )
    ).toBe(true);

    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
  });
}

function registerMissingTargetTest() {
  it('returns null when canvas or editable target is missing', () => {
    expect(selectLayerObject(null, 'missing', {}, vi.fn(), vi.fn())).toBeNull();

    const canvas = createCanvas([createObject('locked')]);
    mocks.isEditableObjectMock.mockReturnValue(false);

    expect(selectLayerObject(canvas as never, 'locked', {}, vi.fn(), vi.fn())).toBeNull();
  });
}

function runSelectionStateSuite() {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isEditableObjectMock.mockReturnValue(true);
  });

  registerRangeSelectionTest();
  registerToggleSelectionTest();
  registerMissingTargetTest();
}

describe('layer action selection state owner', runSelectionStateSuite);

it.each([undefined, false, true])(
  'selects a position-locked source row independently of content marker %s',
  async (contentLocked) => {
    mocks.isEditableObjectMock.mockReturnValue(true);
    const source = new FabricImage(document.createElement('canvas'), {
      width: 20,
      height: 12,
      selectable: false,
      evented: false,
      hasControls: false,
      lockMovementX: true,
      lockMovementY: true,
      lockScalingX: true,
      lockScalingY: true,
      lockRotation: true,
    });
    source.sniptaleId = 'source';
    source.sniptaleType = 'source-image';
    source.sniptaleRole = 'source';
    source.sniptaleLocked = true;
    if (contentLocked !== undefined) source.sniptaleContentLocked = contentLocked;
    const canvas = new Canvas(document.createElement('canvas'));
    try {
      canvas.add(source);
      const result = selectLayerObject(
        canvas,
        'source',
        {},
        () => false,
        () => undefined
      );
      expect(result).toBe(false);
      expect(canvas.getActiveObjects()).toEqual([source]);
      expect(source).toMatchObject({
        sniptaleLocked: true,
        selectable: false,
        evented: false,
        hasControls: false,
        lockMovementX: true,
        lockMovementY: true,
        lockScalingX: true,
        lockScalingY: true,
        lockRotation: true,
      });
      expect(source.sniptaleContentLocked).toBe(contentLocked);
    } finally {
      await canvas.dispose();
    }
  }
);
