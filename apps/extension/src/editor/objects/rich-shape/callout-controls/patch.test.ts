import { expect, it } from 'vitest';
import type { EditorRichShapeCalloutGeometry } from '../../../../features/editor/document/rich-shape';
import { createCalloutBasePatch, createCalloutTipPatch, getCalloutBasePoint } from './patch';

function createCallout(
  patch: Partial<EditorRichShapeCalloutGeometry> = {}
): EditorRichShapeCalloutGeometry {
  return {
    body: { height: 60, left: 20, top: 10, width: 100 },
    tail: {
      baseEndRatio: 0.75,
      baseStartRatio: 0.25,
      side: 'bottom',
      tip: { x: 80, y: 120 },
    },
    ...patch,
  };
}

it('moves callout base points while preserving a minimum base gap', () => {
  const callout = createCallout();
  const nextStart = createCalloutBasePatch(
    callout,
    { frame: { height: 140, width: 160 }, style: { cornerRadius: 8 } } as never,
    'baseStart',
    { x: 110, y: 70 }
  );
  const nextEnd = createCalloutBasePatch(
    callout,
    { frame: { height: 140, width: 160 }, style: { cornerRadius: 8 } } as never,
    'baseEnd',
    { x: 10, y: 70 }
  );

  expect(getCalloutBasePoint(callout, 'baseStart')).toEqual({ x: 45, y: 70 });
  expect(nextStart.tail.baseStartRatio).toBeLessThanOrEqual(callout.tail.baseEndRatio - 0.08);
  expect(nextEnd.tail.baseEndRatio).toBeGreaterThanOrEqual(callout.tail.baseStartRatio + 0.08);
});

it('clamps callout tips to the rich-shape frame', () => {
  expect(
    createCalloutTipPatch(
      createCallout(),
      { height: 100, left: 0, top: 0, width: 160 },
      { x: 200, y: -10 }
    ).tail.tip
  ).toEqual({ x: 160, y: 0 });
});
