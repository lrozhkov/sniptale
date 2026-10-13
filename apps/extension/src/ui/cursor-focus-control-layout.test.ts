import { expect, it } from 'vitest';
import { layoutCursorFocusControls } from './cursor-focus-control-layout';

it('separates clipped targets from the key and each other while preserving observations', () => {
  const input = {
    point: { x: 986, y: 500 },
    controls: { incoming: { x: 2000, y: 500 }, outgoing: { x: 2000, y: 500 } },
    bounds: { left: 0, top: 0, right: 1000, bottom: 1000 },
  };
  const before = structuredClone(input);
  const result = layoutCursorFocusControls(input);
  for (const point of [result.incoming!, result.outgoing!]) {
    expect(Math.hypot(point.x - input.point.x, point.y - input.point.y)).toBeGreaterThanOrEqual(28);
    expect(point.x).toBeGreaterThanOrEqual(14);
    expect(point.x).toBeLessThanOrEqual(986);
  }
  expect(
    Math.hypot(result.incoming!.x - result.outgoing!.x, result.incoming!.y - result.outgoing!.y)
  ).toBeGreaterThanOrEqual(28);
  expect(input).toEqual(before);
});
it('keeps ordinary controls at their observed positions and handles a small canvas', () => {
  expect(
    layoutCursorFocusControls({
      point: { x: 50, y: 50 },
      controls: { incoming: undefined, outgoing: { x: 55, y: 50 } },
      bounds: { left: 0, top: 0, right: 100, bottom: 100 },
    }).outgoing
  ).toEqual({ x: 55, y: 50 });
  const result = layoutCursorFocusControls({
    point: { x: 10, y: 10 },
    controls: { incoming: { x: -100, y: -100 }, outgoing: { x: 100, y: 100 } },
    bounds: { left: 0, top: 0, right: 20, bottom: 20 },
  });
  expect(result).toEqual({ incoming: { x: 10, y: 10 }, outgoing: { x: 10, y: 10 } });
});
