// @vitest-environment jsdom
import { Rect, Point, util, type Transform } from 'fabric';
import type {
  EditorMagnetAligningGuidelines,
  EditorMagnetTransformEvent,
} from './aligning-guidelines';
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
  rect.sniptaleType = 'shape';
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

function movementHarness() {
  const movingTarget = createRect({ left: 43, top: 38, width: 20, height: 20 });
  const sibling = createRect({ left: 60, top: 40, width: 20, height: 20 });
  const canvas = createCanvas([movingTarget, sibling]);
  const manager = createEditorMagnetManager({
    canvas: canvas as never,
    getActiveTool: () => 'shape',
    getCanvasDocumentSize: () => ({ width: 100, height: 80 }),
    getCropGuide: () => null,
    getWorkspace: () => ({
      backgroundColor: '#ffffff',
      hideSelectionWhileDragging: true,
      gridColor: '#d1d5db',
      gridEnabled: false,
      gridSize: 24,
      gridSnapEnabled: false,
      magnetEnabled: true,
    }),
  }) as ReturnType<typeof createEditorMagnetManager> & EditorMagnetAligningGuidelines;

  return { movingTarget, sibling, manager };
}

it('keeps magnet snapping active while selected objects move outside select mode', () => {
  const { manager, movingTarget } = movementHarness();
  manager.moving(movementEvent(movingTarget));
  expect(movingTarget.left).toBe(40);
  expect(manager.hasActiveGuides()).toBe(true);
  manager.dispose();
});

function movementEvent(target: Rect, modifiers: MouseEventInit = {}): EditorMagnetTransformEvent {
  const transform: Transform = {
    target,
    action: 'drag',
    corner: '',
    scaleX: target.scaleX,
    scaleY: target.scaleY,
    skewX: 0,
    skewY: 0,
    offsetX: 0,
    offsetY: 0,
    originX: 'center',
    originY: 'center',
    ex: 0,
    ey: 0,
    lastX: 0,
    lastY: 0,
    theta: util.degreesToRadians(0),
    width: target.width,
    height: target.height,
    shiftKey: modifiers.shiftKey ?? false,
    altKey: false,
    original: { ...util.saveObjectTransform(target), originX: 'center', originY: 'center' },
    actionPerformed: true,
  };
  return { target, transform, pointer: new Point(), e: new MouseEvent('mousemove', modifiers) };
}

it.each(['x', 'y'] as const)(
  'preserves the native movement lock on %s while snapping the free axis',
  (axis) => {
    const { manager, movingTarget } = movementHarness();
    movingTarget.lockMovementX = axis === 'x';
    movingTarget.lockMovementY = axis === 'y';
    manager.moving(movementEvent(movingTarget));
    expect(movingTarget.left).toBe(axis === 'x' ? 43 : 40);
    expect(movingTarget.top).toBe(axis === 'y' ? 38 : 40);
    expect(manager.getVisualFeedback().acceptedByAxis[axis]).toBeUndefined();
    manager.dispose();
  }
);

it('uses vertical Shift intent without allowing a horizontal magnet correction', () => {
  const { manager, movingTarget, sibling } = movementHarness();
  movingTarget.set({ left: 100, top: 100 });
  sibling.set({ left: 200, top: 164 });
  sibling.setCoords();
  const event = movementEvent(movingTarget, { shiftKey: true });
  event.pointer = new Point(9, 60);
  manager.moving(event);
  expect(movingTarget.left).toBe(100);
  expect(movingTarget.top).toBe(164);
  expect(manager.getVisualFeedback().acceptedByAxis.x).toBeUndefined();
  manager.dispose();
});

it('Alt bypass clears prior feedback and preserves raw movement and resize geometry', () => {
  const { manager, movingTarget } = movementHarness();
  manager.moving(movementEvent(movingTarget));
  expect(manager.hasActiveGuides()).toBe(true);
  movingTarget.set({ left: 43, top: 38 });
  movingTarget.setCoords();
  const event = movementEvent(movingTarget, { altKey: true });
  manager.moving(event);
  expect(movingTarget.left).toBe(43);
  expect(movingTarget.top).toBe(38);
  expect(manager.getVisualFeedback()).toEqual({ guides: [], relations: [], acceptedByAxis: {} });
  event.transform.action = 'scaleX';
  event.transform.corner = 'mr';
  const raw = movingTarget.getBoundingRect();
  manager.scalingOrResizing(event);
  expect(movingTarget.getBoundingRect()).toEqual(raw);
  expect(manager.hasActiveGuides()).toBe(false);
  manager.dispose();
});
