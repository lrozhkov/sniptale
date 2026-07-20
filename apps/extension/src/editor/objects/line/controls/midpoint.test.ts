// @vitest-environment jsdom
import { Point } from 'fabric';
import { expect, it } from 'vitest';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import { createLineObject, updateLineObject } from '..';
import { createLineControls } from './factory';
import { createLineMidpointControl } from './midpoint';

const settings = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET).line;

it('places midpoint controls and inserts then moves one point during a drag session', () => {
  const line = createLineObject({
    id: 'line-midpoint-owner',
    labelIndex: 1,
    points: [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
    ],
    settings,
  });
  const control = createLineMidpointControl(0, updateLineObject, createLineControls);

  const position = control.positionHandler?.(
    new Point(0, 0),
    line.calcTransformMatrix(),
    line,
    control
  );
  expect(position?.x).toBeCloseTo(40);

  expect(control.actionHandler?.({} as never, { target: line } as never, 40, 20)).toBe(true);
  expect(line.sniptaleLinePoints).toEqual([
    { x: 0, y: 0 },
    { x: 40, y: 20 },
    { x: 80, y: 0 },
  ]);

  expect(control.actionHandler?.({} as never, { target: line } as never, 50, 30)).toBe(true);
  expect(line.sniptaleLinePoints).toEqual([
    { x: 0, y: 0 },
    { x: 50, y: 30 },
    { x: 80, y: 0 },
  ]);
});

it('ignores invalid midpoint targets', () => {
  const line = createLineObject({
    id: 'line-invalid-midpoint-owner',
    labelIndex: 1,
    points: [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
    ],
    settings,
  });
  const control = createLineMidpointControl(0, updateLineObject, createLineControls);

  expect(control.actionHandler?.({} as never, { target: {} } as never, 40, 20)).toBe(false);
  expect(
    control.positionHandler?.(new Point(0, 0), line.calcTransformMatrix(), {} as never, control)
  ).toEqual(new Point(0, 0));
});
