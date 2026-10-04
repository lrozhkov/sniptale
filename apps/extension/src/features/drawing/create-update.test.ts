import { describe, expect, it, vi } from 'vitest';
import { createDefaultDrawingToolDefaults } from './model';
import { createDrawingObject } from './create';
import { updateCreatedDrawingObject } from './update';

vi.stubGlobal('crypto', { randomUUID: () => 'object-id' });
const defaults = createDefaultDrawingToolDefaults();
const start = { x: 100, y: 80 };

describe('shared drawing creation', () => {
  it.each(['pencil', 'marker', 'shape', 'arrow', 'blur'] as const)(
    'creates %s through one model factory',
    (tool) => {
      expect(createDrawingObject(tool, start, 10, defaults)).toMatchObject({
        id: 'drawing-object-id',
      });
    }
  );

  it('keeps select and text creation under their interaction-specific owners', () => {
    expect(createDrawingObject('select', start, 10, defaults)).toBeNull();
    expect(createDrawingObject('text', start, 10, defaults)).toBeNull();
  });

  it('creates blur with the selected strength, strong by default', () => {
    expect(createDrawingObject('blur', start, 10, defaults)).toMatchObject({ amount: 20 });
    expect(
      createDrawingObject('blur', start, 10, { ...defaults, blur: { amount: 2 } })
    ).toMatchObject({ amount: 2 });
  });

  it('keeps shape-only aspect locking without changing the pointer-down origin', () => {
    const shape = createDrawingObject('shape', start, 10, defaults)!;
    expect(
      updateCreatedDrawingObject({
        modifiers: { ctrlKey: true, shiftKey: false },
        object: shape,
        point: { x: 130, y: 100 },
        start,
        timestamp: 20,
      })
    ).toMatchObject({ bounds: { x: 100, y: 80, width: 30, height: 20 } });
    expect(
      updateCreatedDrawingObject({
        modifiers: { ctrlKey: true, shiftKey: true },
        object: shape,
        point: { x: 130, y: 100 },
        start,
        timestamp: 20,
      })
    ).toMatchObject({ bounds: { x: 100, y: 80, width: 30, height: 30 } });

    const blur = createDrawingObject('blur', start, 10, defaults)!;
    expect(
      updateCreatedDrawingObject({
        modifiers: { ctrlKey: true, shiftKey: true },
        object: blur,
        point: { x: 130, y: 100 },
        start,
        timestamp: 20,
      })
    ).toMatchObject({ bounds: { x: 100, y: 80, width: 30, height: 20 } });
  });

  it('uses Ctrl for a straight free-angle stroke and Shift for angle snapping', () => {
    const pencil = createDrawingObject('pencil', start, 10, defaults)!;
    const straight = updateCreatedDrawingObject({
      modifiers: { ctrlKey: true, shiftKey: false },
      object: pencil,
      point: { x: 123, y: 97 },
      start,
      timestamp: 20,
    });
    expect(straight.kind === 'pencil' && straight.samples).toHaveLength(2);
    const arrow = createDrawingObject('arrow', start, 10, defaults)!;
    const snapped = updateCreatedDrawingObject({
      modifiers: { ctrlKey: false, shiftKey: true },
      object: arrow,
      point: { x: 140, y: 91 },
      start,
      timestamp: 20,
    });
    const angle =
      snapped.kind === 'arrow'
        ? (Math.atan2(snapped.end.y - start.y, snapped.end.x - start.x) * 180) / Math.PI
        : -1;
    expect(angle).toBeCloseTo(15, 5);
  });

  it('keeps free angles outside the snap tolerance and handles zero-length arrows', () => {
    const arrow = createDrawingObject('arrow', start, 10, defaults)!;
    expect(
      updateCreatedDrawingObject({
        modifiers: { ctrlKey: false, shiftKey: false },
        object: arrow,
        point: { x: 131, y: 99 },
        start,
        timestamp: 20,
      })
    ).toMatchObject({ end: { x: 131, y: 99 } });
    expect(
      updateCreatedDrawingObject({
        modifiers: { ctrlKey: false, shiftKey: false },
        object: arrow,
        point: start,
        start,
        timestamp: 20,
      })
    ).toMatchObject({ end: start });
  });

  it('keeps an arrow free near horizontal unless Shift is held', () => {
    const arrow = createDrawingObject('arrow', start, 10, defaults)!;
    const point = { x: 200, y: 84 };
    expect(
      updateCreatedDrawingObject({
        arrowFreeAngle: true,
        modifiers: { ctrlKey: false, shiftKey: false },
        object: arrow,
        point,
        start,
        timestamp: 20,
      })
    ).toMatchObject({ end: point });
    expect(
      updateCreatedDrawingObject({
        arrowFreeAngle: true,
        modifiers: { ctrlKey: false, shiftKey: true },
        object: arrow,
        point,
        start,
        timestamp: 20,
      })
    ).not.toMatchObject({ end: point });
  });

  it('anchors the arrowhead at pointer down when drawing from its tip', () => {
    const arrow = createDrawingObject('arrow', start, 10, {
      ...defaults,
      arrow: { ...defaults.arrow, drawFromTip: true },
    })!;
    const point = { x: 184, y: 115 };
    expect(arrow).not.toHaveProperty('drawFromTip');
    expect(
      updateCreatedDrawingObject({
        arrowFreeAngle: true,
        arrowFromTip: true,
        modifiers: { ctrlKey: false, shiftKey: false },
        object: arrow,
        point,
        start,
        timestamp: 20,
      })
    ).toMatchObject({ start: point, end: start });
  });
});
