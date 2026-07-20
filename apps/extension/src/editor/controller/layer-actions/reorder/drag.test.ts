import type { Canvas } from 'fabric';
import { beforeEach, expect, it, vi } from 'vitest';
import { reorderLayerObjects } from './drag';

const mocks = vi.hoisted(() => ({
  getLayerObjects: vi.fn(),
}));

vi.mock('../../document/layers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/layers')>()),
  getLayerObjects: mocks.getLayerObjects,
}));

type LayerObject = {
  sniptaleId: string;
  sniptaleLocked?: boolean;
  sniptaleRole?: string;
  sniptaleType?: string;
};

type LayerCanvas = Canvas & {
  moveObjectTo: ReturnType<typeof vi.fn>;
};

function createObject(id: string, overrides: Partial<LayerObject> = {}): LayerObject {
  return {
    sniptaleId: id,
    ...overrides,
  };
}

function createCanvas(): LayerCanvas {
  return {
    moveObjectTo: vi.fn(),
  } as unknown as LayerCanvas;
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('reorders dragged layers using reversed layer panel order', () => {
  const first = createObject('first');
  const second = createObject('second');
  const third = createObject('third');
  const canvas = createCanvas();
  mocks.getLayerObjects.mockReturnValue([first, second, third]);

  expect(reorderLayerObjects(canvas, 'third', 'first')).toBe(true);

  expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(1, third, 0);
  expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(2, first, 1);
  expect(canvas.moveObjectTo).toHaveBeenNthCalledWith(3, second, 2);
});

it('blocks invalid, locked, and source-boundary drag reorders', () => {
  const source = createObject('source', { sniptaleType: 'source-image' });
  const locked = createObject('locked', { sniptaleLocked: true });
  const target = createObject('target');
  const canvas = createCanvas();
  mocks.getLayerObjects.mockReturnValue([source, locked, target]);

  expect(reorderLayerObjects(null, 'locked', 'target')).toBe(false);
  expect(reorderLayerObjects(canvas, 'locked', 'locked')).toBe(false);
  expect(reorderLayerObjects(canvas, 'missing', 'target')).toBe(false);
  expect(reorderLayerObjects(canvas, 'locked', 'target')).toBe(false);
  expect(reorderLayerObjects(canvas, 'target', 'source')).toBe(false);
  expect(reorderLayerObjects(canvas, 'source', 'target')).toBe(false);
  expect(canvas.moveObjectTo).not.toHaveBeenCalled();
});
