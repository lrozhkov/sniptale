// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import { createRichShapeCalloutControls } from './callout-controls/factory';
import { createRichShapeCalloutObject } from './';

function createCalloutObject() {
  return createRichShapeCalloutObject({
    id: 'callout-controls',
    labelIndex: 1,
    left: 0,
    settings: DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET).callout,
    top: 0,
    width: 160,
    height: 100,
  });
}

it('positions and updates the three authored tail controls', () => {
  const object = createCalloutObject();
  const update = vi.fn(() => true);
  const controls = createRichShapeCalloutControls(object, update);

  const tipPosition = controls['calloutTip']?.positionHandler?.(
    {} as never,
    {} as never,
    object,
    {} as never
  );
  const moved = controls['calloutTip']?.actionHandler?.(
    {} as never,
    { target: object } as never,
    120,
    30
  );
  controls['calloutBaseStart']?.actionHandler?.({} as never, { target: object } as never, 40, 20);
  object.sniptaleRichShape.callout = {
    ...object.sniptaleRichShape.callout!,
    tail: { ...object.sniptaleRichShape.callout!.tail, side: 'left' },
  };
  controls['calloutBaseEnd']?.actionHandler?.({} as never, { target: object } as never, 40, 60);

  expect(Object.keys(controls)).toEqual(
    expect.arrayContaining(['calloutBaseStart', 'calloutBaseEnd', 'calloutTip'])
  );
  expect(tipPosition?.x).toBeTypeOf('number');
  expect(moved).toBe(true);
  expect(update).toHaveBeenCalledWith(
    object,
    expect.objectContaining({
      callout: expect.objectContaining({
        tail: expect.objectContaining({ tip: expect.any(Object) }),
      }),
    })
  );
  expect(update).toHaveBeenCalledWith(
    object,
    expect.objectContaining({
      callout: expect.objectContaining({
        tail: expect.objectContaining({ baseStartRatio: expect.any(Number) }),
      }),
    })
  );
});

it('falls back to default object controls for non-callout rich shapes', () => {
  const object = createCalloutObject();
  const controls = createRichShapeCalloutControls(object, vi.fn());
  const invalidPosition = controls['calloutTip']?.positionHandler?.(
    {} as never,
    {} as never,
    {} as never,
    {} as never
  );
  const invalidAction = controls['calloutTip']?.actionHandler?.(
    {} as never,
    { target: {} } as never,
    0,
    0
  );

  delete object.sniptaleRichShape.callout;
  const missingCalloutPosition = controls['calloutTip']?.positionHandler?.(
    {} as never,
    {} as never,
    object,
    {} as never
  );
  const missingCalloutAction = controls['calloutTip']?.actionHandler?.(
    {} as never,
    { target: object } as never,
    0,
    0
  );

  expect(invalidPosition).toMatchObject({ x: 0, y: 0 });
  expect(invalidAction).toBe(false);
  expect(missingCalloutPosition).toMatchObject({ x: 0, y: 0 });
  expect(missingCalloutAction).toBe(false);
  expect(createRichShapeCalloutControls(object, vi.fn())['calloutTip']).toBeUndefined();
});
