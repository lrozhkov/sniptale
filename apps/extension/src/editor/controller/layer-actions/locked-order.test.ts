import type { Canvas } from 'fabric';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findObjectByIdMock: vi.fn(),
  getLayerObjectsMock: vi.fn(),
}));

vi.mock('../document/layers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../document/layers')>()),
  findObjectById: mocks.findObjectByIdMock,
  getLayerObjects: mocks.getLayerObjectsMock,
}));

import {
  moveLayerSelection,
  moveLayerSelectionToEdge,
  reorderLayerObjects,
  resizeLayerObject,
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
  visible: boolean;
} & Record<string, unknown>;

type LayerCanvas = Canvas & {
  discardActiveObject: ReturnType<typeof vi.fn>;
  getActiveObject: ReturnType<typeof vi.fn>;
  getActiveObjects: ReturnType<typeof vi.fn>;
  getObjects: ReturnType<typeof vi.fn>;
  moveObjectTo: ReturnType<typeof vi.fn>;
  requestRenderAll: ReturnType<typeof vi.fn>;
};

function createObject(id: string, overrides: Record<string, unknown> = {}): LayerObject {
  return {
    getScaledHeight: () => 50,
    getScaledWidth: () => 100,
    sniptaleId: id,
    sniptaleLocked: false,
    scaleX: 1,
    scaleY: 1,
    set: vi.fn(),
    visible: true,
    ...overrides,
  };
}

function createCanvas(objects: LayerObject[], activeObjects: LayerObject[] = []): LayerCanvas {
  return {
    discardActiveObject: vi.fn(),
    getActiveObject: vi.fn(() => activeObjects[0] ?? null),
    getActiveObjects: vi.fn(() => activeObjects),
    getObjects: vi.fn(() => objects),
    moveObjectTo: vi.fn(),
    requestRenderAll: vi.fn(),
  } as unknown as LayerCanvas;
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('keeps dragged and edge-moved layers above the source image boundary', () => {
  const source = createObject('source', { sniptaleType: 'source-image' });
  const first = createObject('first');
  const second = createObject('second');
  const canvas = createCanvas([source, first, second], [second]);
  mocks.getLayerObjectsMock.mockReturnValue([source, first, second]);

  expect(reorderLayerObjects(canvas, 'second', 'source')).toBe(false);
  expect(reorderLayerObjects(canvas, 'source', 'first')).toBe(false);

  expect(moveLayerSelectionToEdge(canvas, 'back')).toBe(true);
  expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(1, source, 0);
  expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(2, second, 1);
  expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(3, first, 2);
});

it('blocks locked layer movement, visibility, and resize while allowing unlock', () => {
  const locked = createObject('locked', { sniptaleLocked: true });
  const source = createObject('source', { sniptaleType: 'source-image' });
  const canvas = createCanvas([source, locked], [locked]);
  const ensureObjectReachable = vi.fn();
  const prepareObject = vi.fn();
  mocks.findObjectByIdMock.mockReturnValue(locked);

  expect(moveLayerSelection(canvas, -1)).toBe(false);
  expect(moveLayerSelectionToEdge(canvas, 'back')).toBe(false);
  expect(toggleLayerVisibility(canvas, 'locked')).toBeNull();
  expect(resizeLayerObject(canvas, 'locked', 10, 10, ensureObjectReachable)).toBeNull();
  expect(toggleLayerLock(canvas, 'locked', prepareObject)).toBe(locked);
  expect(locked.sniptaleLocked).toBe(false);
});
