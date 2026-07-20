import { Path } from 'fabric';
import { expect, it } from 'vitest';
import {
  applyArrowObjectState,
  pickArrowPointUpdateOptions,
  resolveArrowUpdatePoints,
} from './state';

const settings = {
  color: '#123456',
  endHead: 'triangle',
  mode: 'straight',
  opacity: 1,
  shadow: 0,
  startHead: 'none',
  variant: 'standard',
  width: 4,
} as const;

it('resolves fallback, start/end, and ignored straight controls', () => {
  expect(
    resolveArrowUpdatePoints([], settings, {
      end: { x: 30, y: 0 },
      start: { x: 0, y: 0 },
    })
  ).toEqual([
    { x: 0, y: 0 },
    { x: 30, y: 0 },
  ]);
  expect(
    resolveArrowUpdatePoints(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      settings,
      { control: { x: 5, y: 8 } }
    )
  ).toEqual([
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ]);
  expect(
    resolveArrowUpdatePoints([], { ...settings, arrowType: 'elbow' } as never, {
      points: [{ x: 6, y: 7 }],
    })
  ).toEqual([
    { x: 6, y: 7 },
    { x: 6, y: 7 },
  ]);
  expect(
    resolveArrowUpdatePoints(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      { ...settings, mode: 'curve' } as never,
      { control: { x: 5, y: 8 } }
    )
  ).toEqual([
    { x: 0, y: 0 },
    { x: 5, y: 8 },
    { x: 10, y: 0 },
  ]);
});

it('keeps null point update options explicit', () => {
  expect(pickArrowPointUpdateOptions({ control: null })).toEqual({ control: null });
  expect(pickArrowPointUpdateOptions({})).toEqual({});
});

it('returns before metadata sync when normalized points have no endpoints', () => {
  const arrow = new Path('M 0 0 L 0 0') as any;

  applyArrowObjectState(arrow, settings as never, [], () => ({}));

  expect(arrow.sniptaleArrowWidth).toBeUndefined();
});
