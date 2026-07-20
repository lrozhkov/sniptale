import type { Canvas } from 'fabric';
import { beforeEach, expect, it, vi } from 'vitest';
import { moveLayerSelection, moveLayerSelectionToEdge } from './selection';

type LayerObject = {
  sniptaleId?: string;
  sniptaleLocked?: boolean;
  sniptaleRole?: string;
  sniptaleType?: string;
};

type LayerCanvas = Canvas & {
  getActiveObjects: ReturnType<typeof vi.fn>;
  getObjects: ReturnType<typeof vi.fn>;
  moveObjectTo: ReturnType<typeof vi.fn>;
};

function createObject(id: string, overrides: Partial<LayerObject> = {}): LayerObject {
  return {
    sniptaleId: id,
    sniptaleLocked: false,
    ...overrides,
  };
}

function createCanvas(objects: LayerObject[], activeObjects: LayerObject[] = []): LayerCanvas {
  return {
    getActiveObjects: vi.fn(() => activeObjects),
    getObjects: vi.fn(() => objects),
    moveObjectTo: vi.fn(),
  } as unknown as LayerCanvas;
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('moves active layer selections forward and backward without crossing source objects', () => {
  const source = createObject('source', { sniptaleType: 'source-image' });
  const first = createObject('first');
  const second = createObject('second');
  const third = createObject('third');
  const canvas = createCanvas([source, first, second, third], [first, second]);

  expect(moveLayerSelection(canvas, 1)).toBe(true);
  expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(1, source, 0);
  expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(2, third, 1);
  expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(3, first, 2);
  expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(4, second, 3);

  canvas.moveObjectTo.mockClear();
  expect(moveLayerSelection(canvas, -1)).toBe(true);
  expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(1, source, 0);
  expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(2, first, 1);
  expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(3, second, 2);
  expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(4, third, 3);
});

it('moves active selections to front and behind editable layers while preserving source boundary', () => {
  const source = createObject('source', { sniptaleType: 'source-image' });
  const first = createObject('first');
  const second = createObject('second');
  const third = createObject('third');
  const canvas = createCanvas([source, first, second, third], [second, first]);

  expect(moveLayerSelectionToEdge(canvas, 'front')).toBe(true);
  expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(1, source, 0);
  expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(2, third, 1);
  expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(3, first, 2);
  expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(4, second, 3);

  canvas.moveObjectTo.mockClear();
  expect(moveLayerSelectionToEdge(canvas, 'back')).toBe(true);
  expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(1, source, 0);
  expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(2, first, 1);
  expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(3, second, 2);
  expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(4, third, 3);
});

it('blocks null, empty, all-selected, locked, and id-less selection movement', () => {
  const first = createObject('first');
  const locked = createObject('locked', { sniptaleLocked: true });

  expect(moveLayerSelection(null, 1)).toBe(false);
  expect(moveLayerSelectionToEdge(null, 'front')).toBe(false);
  expect(moveLayerSelection(createCanvas([first], []), 1)).toBe(false);
  expect(moveLayerSelection(createCanvas([first], [{}]), 1)).toBe(false);
  expect(moveLayerSelection(createCanvas([locked], [locked]), 1)).toBe(false);
  expect(moveLayerSelectionToEdge(createCanvas([first], [first]), 'front')).toBe(false);
  expect(moveLayerSelectionToEdge(createCanvas([locked, first], [locked]), 'back')).toBe(false);
});
