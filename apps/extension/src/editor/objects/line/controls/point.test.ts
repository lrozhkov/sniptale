// @vitest-environment jsdom
import { Point } from 'fabric';
import { expect, it } from 'vitest';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import { createLineObject, updateLineObject } from '..';
import { createLinePointControl } from './point';

const settings = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET).line;

it('moves point controls while preserving the opposite anchor', () => {
  const line = createLineObject({
    id: 'line-point-owner',
    labelIndex: 1,
    points: [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 60 },
    ],
    settings,
  });
  const control = createLinePointControl(1, updateLineObject);

  expect(
    control.positionHandler?.(new Point(0, 0), line.calcTransformMatrix(), line, control)
  ).toBeDefined();
  expect(control.actionHandler?.({} as never, { target: line } as never, 90, 10)).toBe(true);

  expect(line.sniptaleLinePoints[1]).toEqual({ x: 90, y: 10 });
  expect(line.left).toBeCloseTo(line.pathOffset.x);
  expect(line.top).toBeCloseTo(line.pathOffset.y);
});

it('ignores invalid point targets and missing point indices', () => {
  const line = createLineObject({
    id: 'line-invalid-point-owner',
    labelIndex: 1,
    points: [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
    ],
    settings,
  });
  const control = createLinePointControl(8, updateLineObject);

  expect(control.actionHandler?.({} as never, { target: {} } as never, 1, 2)).toBe(false);
  expect(control.actionHandler?.({} as never, { target: line } as never, 1, 2)).toBe(false);
  expect(
    control.positionHandler?.(new Point(0, 0), line.calcTransformMatrix(), {} as never, control)
  ).toEqual(new Point(0, 0));
});
