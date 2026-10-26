// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { createDesignReviewMeasureState } from '../../../selection/design-review/measure';
import { formatMeasureNumber, readMeasurePair, placeMeasureGuideLabel } from './measure-model';
afterEach(() => document.body.replaceChildren());
function target(x: number, width: number) {
  const element = document.createElement('div');
  document.body.append(element);
  const rect = DOMRect.fromRect({ x, y: 20, width, height: 40 });
  Object.defineProperty(element, 'getBoundingClientRect', { value: () => rect });
  Object.defineProperty(element, 'getClientRects', { value: () => [rect] });
  return element;
}
it('reads live geometry and grouped property differences without changing source styles', () => {
  const a = target(10, 100),
    b = target(130, 80);
  a.style.fontSize = '16px';
  b.style.fontSize = '20px';
  const state = { ...createDesignReviewMeasureState(), a, b, slot: null };
  const before = [a.outerHTML, b.outerHTML];
  const result = readMeasurePair(state);
  expect(result).toMatchObject({ kind: 'ready', geometry: { gapX: 20, overlapY: 40 } });
  if (result.kind !== 'ready') throw new Error('Pair unavailable');
  expect(result.differences.find((group) => group.group === 'text')?.values).toContainEqual({
    property: 'font-size',
    a: '16px',
    b: '20px',
  });
  expect([a.outerHTML, b.outerHTML]).toEqual(before);
  b.style.fontSize = '16px';
  const updated = readMeasurePair(state);
  if (updated.kind !== 'ready') throw new Error('Pair unavailable');
  expect(updated.differences.find((group) => group.group === 'text')?.values).not.toContainEqual(
    expect.objectContaining({ property: 'font-size' })
  );
  b.remove();
  expect(readMeasurePair(state).kind).toBe('unavailable');
});
it('keeps display rounding independent from geometric calculation', () => {
  expect(formatMeasureNumber(10.249)).toBe('10.2');
  expect(formatMeasureNumber(10.251)).toBe('10.3');
});

it('places tight-gap labels outside source text and keeps long values inside the viewport', () => {
  const boxes = [
    { x: 100, y: 200, width: 100, height: 40 },
    { x: 216, y: 200, width: 100, height: 40 },
  ];
  const placement = placeMeasureGuideLabel(
    { x1: 200, y1: 220, x2: 216, y2: 220, value: 16 },
    boxes,
    { width: 1280, height: 560 }
  );
  expect(placement).not.toBeNull();
  expect(placement!.top + placement!.height).toBeLessThanOrEqual(200);
  expect(
    placeMeasureGuideLabel(
      { x1: 0, y1: 220, x2: 1280, y2: 220, value: 1234567.8 },
      [{ x: 0, y: 0, width: 1280, height: 560 }],
      { width: 1280, height: 560 }
    )
  ).toBeNull();
});
