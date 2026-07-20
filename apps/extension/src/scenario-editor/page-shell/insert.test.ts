import { expect, it } from 'vitest';
import { DEFAULT_SCENARIO_V3_CANVAS } from '../../features/scenario/project/v3';
import { createInsertedElementAtPoint, createInsertedElementFromDrag } from './insert';

it('places inserted elements at canvas points and clamps frame-based elements to bounds', () => {
  expect(
    createInsertedElementAtPoint({
      canvas: DEFAULT_SCENARIO_V3_CANVAS,
      kind: 'shape',
      point: { x: 2000, y: 2000 },
    })
  ).toEqual(
    expect.objectContaining({
      frame: expect.objectContaining({ x: 960, y: 600 }),
      kind: 'shape',
    })
  );
});

it('creates connector insertions from the clicked point with matching endpoint frames', () => {
  expect(
    createInsertedElementAtPoint({
      canvas: DEFAULT_SCENARIO_V3_CANVAS,
      kind: 'arrow',
      point: { x: 64, y: 96 },
    })
  ).toEqual(
    expect.objectContaining({
      end: { x: 304, y: 168 },
      frame: { height: 72, width: 240, x: 64, y: 96 },
      kind: 'arrow',
      start: { x: 64, y: 96 },
    })
  );
});

it('creates drawn elements from canvas drag geometry', () => {
  expect(
    createInsertedElementFromDrag({
      canvas: DEFAULT_SCENARIO_V3_CANVAS,
      current: { x: 420, y: 320 },
      kind: 'shape',
      origin: { x: 120, y: 160 },
    })
  ).toEqual(
    expect.objectContaining({
      frame: { height: 160, width: 300, x: 120, y: 160 },
      kind: 'shape',
    })
  );
});

it('normalizes tiny dragged elements through the shared canvas draw threshold', () => {
  expect(
    createInsertedElementFromDrag({
      canvas: DEFAULT_SCENARIO_V3_CANVAS,
      current: { x: 123, y: 163 },
      kind: 'shape',
      origin: { x: 120, y: 160 },
    })
  ).toEqual(
    expect.objectContaining({
      frame: { height: 8, width: 8, x: 116, y: 156 },
      kind: 'shape',
    })
  );
});

it('creates drawn connectors with drag endpoints and normalized frames', () => {
  expect(
    createInsertedElementFromDrag({
      canvas: DEFAULT_SCENARIO_V3_CANVAS,
      current: { x: 64, y: 96 },
      kind: 'arrow',
      origin: { x: 304, y: 168 },
    })
  ).toEqual(
    expect.objectContaining({
      end: { x: 64, y: 96 },
      frame: { height: 72, width: 240, x: 64, y: 96 },
      kind: 'arrow',
      start: { x: 304, y: 168 },
    })
  );
});
