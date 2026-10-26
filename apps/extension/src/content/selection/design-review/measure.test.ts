// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import {
  chooseMeasureTarget,
  clearMeasureB,
  createDesignReviewMeasureState,
  escapeMeasureState,
  measureBorderBoxes,
  previewMeasureTarget,
  replaceMeasureTarget,
  swapMeasureTargets,
  cancelMeasurePreview,
} from './measure';
const box = () => {
  const element = document.createElement('div');
  document.body.append(element);
  return element;
};
afterEach(() => document.body.replaceChildren());
it('keeps accepted A/B separate from a hovered or replacement target', () => {
  const a = box(),
    b = box(),
    c = box();
  const first = chooseMeasureTarget(createDesignReviewMeasureState(), a);
  const preview = previewMeasureTarget(first, b);
  expect(preview).toMatchObject({ a, b: null, preview: b, slot: 'b' });
  expect(first).toMatchObject({ a, b: null, preview: null });
  const pair = chooseMeasureTarget(preview, b);
  expect(chooseMeasureTarget(pair, c)).toBe(pair);
  const replacing = previewMeasureTarget(replaceMeasureTarget(pair, 'a'), c);
  expect(replacing).toMatchObject({ a, b, preview: c, slot: 'a' });
  expect(cancelMeasurePreview(replacing)).toEqual(pair);
  expect(chooseMeasureTarget(replacing, c)).toMatchObject({ a: c, b, slot: null });
});
it('supports swap, clear and Escape from preview through B, A, and exit', () => {
  const a = box(),
    b = box(),
    c = box();
  const pair = chooseMeasureTarget(chooseMeasureTarget(createDesignReviewMeasureState(), a), b);
  expect(swapMeasureTargets(pair)).toMatchObject({ a: b, b: a });
  expect(clearMeasureB(pair)).toMatchObject({ a, b: null, slot: 'b' });
  let state = escapeMeasureState(previewMeasureTarget(replaceMeasureTarget(pair, 'b'), c))!;
  expect(state).toEqual(pair);
  state = escapeMeasureState(state)!;
  expect(state).toMatchObject({ a, b: null });
  state = escapeMeasureState(state)!;
  expect(state.a).toBeNull();
  expect(escapeMeasureState(state)).toBeNull();
});
it('rejects self-pairs and detached replacements without rebinding a recreated identity', () => {
  const a = box(),
    b = box();
  const first = chooseMeasureTarget(createDesignReviewMeasureState(), a);
  expect(chooseMeasureTarget(first, a)).toBe(first);
  b.remove();
  expect(chooseMeasureTarget(first, b)).toBe(first);
  a.id = 'same';
  a.remove();
  const recreated = box();
  recreated.id = 'same';
  expect(first.a).toBe(a);
  expect(first.a).not.toBe(recreated);
});
it('measures gaps, overlaps, touching bounds and contained insets as geometry', () => {
  const a = { x: 10, y: 20, width: 100, height: 40 };
  expect(measureBorderBoxes(a, { x: 130, y: 30, width: 60, height: 50 })).toMatchObject({
    gapX: 20,
    gapY: 0,
    overlapX: 0,
    overlapY: 30,
    contains: null,
  });
  expect(measureBorderBoxes(a, { x: 110, y: 60, width: 20, height: 20 })).toMatchObject({
    gapX: 0,
    gapY: 0,
    overlapX: 0,
    overlapY: 0,
  });
  expect(measureBorderBoxes(a, { x: 20.25, y: 25, width: 50.5, height: 20 })).toMatchObject({
    contains: 'a',
    insets: { left: 10.25, top: 5, right: 39.25, bottom: 15 },
  });
});
