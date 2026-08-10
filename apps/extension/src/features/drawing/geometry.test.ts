import { expect, it } from 'vitest';
import {
  createDrawingBounds,
  getDrawingObjectBounds,
  getDrawingShapePoints,
  hitTestDrawingDocument,
  hitTestDrawingObject,
  replaceDrawingObjectBounds,
  translateDrawingObject,
} from './geometry';

it('normalizes reverse drags and selects the topmost object', () => {
  expect(createDrawingBounds({ x: 20, y: 30 }, { x: 5, y: 10 })).toEqual({
    x: 5,
    y: 10,
    width: 15,
    height: 20,
  });
  const bottom = {
    id: 'bottom',
    kind: 'rectangle' as const,
    bounds: { x: 0, y: 0, width: 50, height: 50 },
    color: '#000000',
    width: 2,
  };
  const top = { id: 'top', kind: 'blur' as const, bounds: { x: 10, y: 10, width: 20, height: 20 } };
  expect(hitTestDrawingDocument([bottom, top], { x: 15, y: 15 })?.id).toBe('top');
});

it('handles every geometry family and rejects misses', () => {
  const arrow = {
    id: 'arrow',
    kind: 'arrow' as const,
    start: { x: 5, y: 5 },
    end: { x: 25, y: 5 },
    color: '#000000',
    dynamicWidth: true,
    width: 18,
  };
  const ellipse = {
    id: 'ellipse',
    kind: 'ellipse' as const,
    bounds: { x: 0, y: 0, width: 20, height: 10 },
    color: '#000000',
    width: 2,
  };
  expect(getDrawingObjectBounds(arrow)).toEqual({ x: 5, y: -13, width: 20, height: 36 });
  expect(hitTestDrawingObject(arrow, { x: 15, y: 6 })).toBe(true);
  expect(hitTestDrawingObject({ ...arrow, end: arrow.start }, { x: 5, y: 5 })).toBe(true);
  expect(hitTestDrawingObject(ellipse, { x: 10, y: 5 })).toBe(true);
  expect(hitTestDrawingObject(ellipse, { x: 19, y: 9 })).toBe(false);
  expect(
    hitTestDrawingObject({ ...ellipse, bounds: { ...ellipse.bounds, width: 0 } }, { x: 0, y: 0 })
  ).toBe(false);
  expect(hitTestDrawingDocument([ellipse], { x: 100, y: 100 })).toBeNull();
  expect(
    getDrawingObjectBounds({
      id: 'empty',
      kind: 'marker',
      samples: [],
      color: '#000000',
      opacity: 1,
      width: 10,
    })
  ).toEqual({ x: 0, y: 0, width: 0, height: 0 });
});

it('builds and hit-tests triangle and parallelogram geometry inside their bounds', () => {
  const triangle = {
    id: 'triangle',
    kind: 'triangle' as const,
    bounds: { x: 0, y: 0, width: 100, height: 80 },
    color: '#000000',
    width: 4,
  };
  const parallelogram = { ...triangle, id: 'parallelogram', kind: 'parallelogram' as const };
  expect(getDrawingShapePoints(triangle)).toEqual([
    { x: 50, y: 0 },
    { x: 100, y: 80 },
    { x: 0, y: 80 },
  ]);
  expect(getDrawingShapePoints(parallelogram)).toEqual([
    { x: 22, y: 0 },
    { x: 100, y: 0 },
    { x: 78, y: 80 },
    { x: 0, y: 80 },
  ]);
  expect(hitTestDrawingObject(triangle, { x: 50, y: 40 })).toBe(true);
  expect(hitTestDrawingObject(triangle, { x: 5, y: 5 })).toBe(false);
  expect(hitTestDrawingObject(parallelogram, { x: 50, y: 40 })).toBe(true);
  expect(hitTestDrawingObject(parallelogram, { x: 2, y: 2 })).toBe(false);
});

it('hit-tests rotatable objects in their local geometry', () => {
  const rectangle = {
    id: 'rotated',
    kind: 'rectangle' as const,
    bounds: { x: 0, y: 0, width: 100, height: 20 },
    color: '#000000',
    rotation: 90,
    width: 4,
  };

  expect(hitTestDrawingObject(rectangle, { x: 50, y: 50 })).toBe(true);
  expect(hitTestDrawingObject(rectangle, { x: 90, y: 10 })).toBe(false);
});

it('hit-tests a sheared rectangle as a parallelogram while preserving rectangle ownership', () => {
  const rectangle = {
    id: 'sheared',
    kind: 'rectangle' as const,
    bounds: { x: 0, y: 0, width: 125, height: 50 },
    color: '#000000',
    skewX: Math.atan(0.5) * (180 / Math.PI),
    width: 4,
  };

  expect(hitTestDrawingObject(rectangle, { x: 30, y: 0 })).toBe(true);
  expect(hitTestDrawingObject(rectangle, { x: -5, y: 0 })).toBe(false);
  expect(hitTestDrawingObject(rectangle, { x: 80, y: 49 })).toBe(true);
});

it('translates and resizes arrows, text, and bounded objects', () => {
  const arrow = {
    id: 'arrow',
    kind: 'arrow' as const,
    start: { x: 0, y: 0 },
    end: { x: 10, y: 10 },
    color: '#000000',
    dynamicWidth: true,
    width: 18,
  };
  expect(translateDrawingObject(arrow, { x: 2, y: 3 })).toMatchObject({ start: { x: 2, y: 3 } });
  expect(replaceDrawingObjectBounds(arrow, { x: 10, y: 10, width: 20, height: 20 })).toMatchObject({
    end: { x: 30, y: 30 },
  });
  const text = {
    id: 'text',
    kind: 'text' as const,
    bounds: { x: 0, y: 0, width: 100, height: 20 },
    text: 'hello',
    color: '#000000',
    backgroundColor: null,
    fontSize: 20,
  };
  expect(replaceDrawingObjectBounds(text, { x: 0, y: 0, width: 10, height: 2 })).toMatchObject({
    bounds: { x: 0, y: 0, width: 10, height: 2 },
    fontSize: 20,
  });
  const blur = { id: 'blur', kind: 'blur' as const, bounds: { x: 0, y: 0, width: 0, height: 0 } };
  expect(translateDrawingObject(blur, { x: 4, y: 5 })).toMatchObject({ bounds: { x: 4, y: 5 } });
  expect(replaceDrawingObjectBounds(blur, { x: 3, y: 4, width: -2, height: -3 })).toMatchObject({
    bounds: { x: 1, y: 1, width: 2, height: 3 },
  });
});

it('moves and resizes freehand samples without introducing a second state owner', () => {
  const pencil = {
    id: 'pencil',
    kind: 'pencil' as const,
    color: '#000000',
    width: 4,
    samples: [
      { x: 0, y: 0, t: 0 },
      { x: 10, y: 10, t: 10 },
    ],
  };
  const moved = translateDrawingObject(pencil, { x: 5, y: 7 });
  expect(moved).toMatchObject({
    samples: [
      { x: 5, y: 7 },
      { x: 15, y: 17 },
    ],
  });
  const resized = replaceDrawingObjectBounds(pencil, { x: 0, y: 0, width: 40, height: 20 });
  expect(resized.kind).toBe('pencil');
  if (resized.kind === 'pencil') {
    expect(resized.samples[0]?.x).toBeGreaterThanOrEqual(0);
    expect(resized.samples[0]?.y).toBeGreaterThanOrEqual(0);
    expect(resized.samples[1]?.x).toBeLessThanOrEqual(40);
    expect(resized.samples[1]?.y).toBeLessThanOrEqual(20);
  }
});
