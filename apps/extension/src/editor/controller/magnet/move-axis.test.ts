import { ActiveSelection, Group, Rect, type Canvas, type FabricObject } from 'fabric';
import { describe, expect, it, vi } from 'vitest';
import type { EditorMagnetAligningGuidelines } from './aligning-guidelines';
import { createEditorMagnetManager } from './manager';
import { getEditorMovePosition, type EditorMoveEvent } from './move-axis';

function createRect(left = 100, top = 100) {
  const target = new Rect({ left, top, width: 20, height: 20, strokeWidth: 0 });
  target.sniptaleType = 'shape';
  target.isOnScreen = () => true;
  target.setCoords();
  return target;
}

function createManager(target: FabricObject, magnetEnabled: boolean) {
  const sibling = createRect(164, 104);
  const objects = [target, sibling];
  const canvas = {
    on: vi.fn(),
    off: vi.fn(),
    getZoom: () => 1,
    viewportTransform: [1, 0, 0, 1, 0, 0],
    forEachObject: (visit: (object: FabricObject) => void) => objects.forEach(visit),
  } as unknown as Canvas;
  objects.forEach((object) => {
    object.canvas = canvas;
  });
  return createEditorMagnetManager({
    canvas,
    getActiveTool: () => 'select',
    getCanvasDocumentSize: () => ({ width: 1000, height: 800 }),
    getCropGuide: () => null,
    getWorkspace: () => ({
      backgroundColor: '#fff',
      gridColor: '#ccc',
      gridEnabled: false,
      gridSnapEnabled: false,
      gridSize: 24,
      hideSelectionWhileDragging: true,
      magnetEnabled,
    }),
  }) as ReturnType<typeof createEditorMagnetManager> & EditorMagnetAligningGuidelines;
}

function event(target: FabricObject, x: number, y: number, shiftKey = true): EditorMoveEvent {
  return {
    target,
    e: { shiftKey },
    pointer: { x, y },
    transform: { action: 'drag', ex: 100, ey: 100, original: { left: 100, top: 100 } },
  };
}

describe('editor Shift movement', () => {
  it('chooses the dominant raw pointer axis instead of snapped target coordinates', () => {
    const target = createRect(100, 400);
    expect(getEditorMovePosition(event(target, 160, 109))).toEqual({
      left: 160,
      top: 100,
      lockedAxis: 'top',
    });
    expect(getEditorMovePosition(event(target, 109, 160))).toEqual({
      left: 100,
      top: 160,
      lockedAxis: 'left',
    });
  });

  it.each([false, true])(
    'constrains movement and restores raw two-axis position on release (magnet %s)',
    (enabled) => {
      const target = createRect(160, 109);
      const manager = createManager(target, enabled);
      const move = event(target, 160, 109);
      manager.moving(move as Parameters<typeof manager.moving>[0]);
      expect(target.top).toBe(100);
      expect(target.left).toBe(enabled ? 164 : 160);
      if (enabled) expect(manager.horizontalLines.size).toBe(0);
      const released = event(target, 220, 139, false);
      manager.moving(released as Parameters<typeof manager.moving>[0]);
      expect(target.left).toBe(220);
      expect(target.top).toBe(139);
    }
  );

  it.each([Group, ActiveSelection])(
    'moves an aggregate without changing its child geometry',
    (Aggregate) => {
      const target = new Aggregate([createRect(10, 20), createRect(40, 50)], {
        left: 100,
        top: 100,
      });
      const children = target.getObjects().map((child) => ({ left: child.left, top: child.top }));
      const manager = createManager(target, false);
      manager.moving(event(target, 109, 160) as Parameters<typeof manager.moving>[0]);
      expect(target.left).toBe(100);
      expect(target.top).toBe(160);
      expect(target.getObjects().map((child) => ({ left: child.left, top: child.top }))).toEqual(
        children
      );
    }
  );

  it('leaves creation and incomplete transforms unchanged', () => {
    expect(getEditorMovePosition({ target: createRect() })).toBeNull();
    const move = event(createRect(), 160, 109);
    if (move.transform) move.transform.action = 'scale';
    expect(getEditorMovePosition(move)).toBeNull();
  });
});
