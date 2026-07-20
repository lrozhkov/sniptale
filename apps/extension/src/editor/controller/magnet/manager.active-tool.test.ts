import { Rect } from 'fabric';
import { expect, it, vi } from 'vitest';
import { createEditorMagnetManager } from './manager';

function createRect(options: { height: number; left: number; top: number; width: number }) {
  const rect = new Rect({
    left: options.left,
    top: options.top,
    width: options.width,
    height: options.height,
    strokeWidth: 0,
  });
  rect.sniptaleType = 'rectangle';
  rect.isOnScreen = () => true;
  rect.setCoords();
  return rect;
}

function createCanvas(objects: Rect[]) {
  const canvas = {
    clearContext: vi.fn(),
    contextTop: {
      beginPath: vi.fn(),
      lineTo: vi.fn(),
      moveTo: vi.fn(),
      restore: vi.fn(),
      save: vi.fn(),
      setLineDash: vi.fn(),
      stroke: vi.fn(),
      transform: vi.fn(),
      translate: vi.fn(),
    },
    forEachObject(callback: (object: Rect) => void) {
      objects.forEach(callback);
    },
    getTopContext() {
      return this.contextTop;
    },
    getZoom() {
      return 1;
    },
    off: vi.fn(),
    on: vi.fn(),
    requestRenderAll: vi.fn(),
    uniScaleKey: 'shiftKey',
    uniformScaling: true,
    viewportTransform: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number],
  };

  for (const object of objects) {
    object.canvas = canvas as never;
  }

  return canvas;
}

it('keeps magnet snapping active while selected objects move outside select mode', () => {
  const movingTarget = createRect({ left: 43, top: 38, width: 20, height: 20 });
  const sibling = createRect({ left: 60, top: 40, width: 20, height: 20 });
  const canvas = createCanvas([movingTarget, sibling]);
  const manager = createEditorMagnetManager({
    canvas: canvas as never,
    getActiveTool: () => 'rectangle',
    getCanvasDocumentSize: () => ({ width: 100, height: 80 }),
    getCropGuide: () => null,
    getWorkspace: () => ({
      backgroundColor: '#ffffff',
      gridColor: '#d1d5db',
      gridEnabled: false,
      gridSize: 24,
      gridSnapEnabled: false,
      magnetEnabled: true,
    }),
  }) as any;

  manager.moving({ target: movingTarget });
  expect(movingTarget.left).toBe(40);
  expect(manager.hasActiveGuides()).toBe(true);
});
