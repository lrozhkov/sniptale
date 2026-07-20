// @vitest-environment jsdom
import { Path } from 'fabric';
import { expect, it } from 'vitest';
import { applyArrowObjectState } from './apply';

const settings = {
  color: '#f60',
  endHead: 'triangle',
  mode: 'curve',
  opacity: 0.65,
  shadow: 0,
  startHead: 'circle',
  variant: 'standard',
  width: 6,
} as const;

it('applies arrow path state while preserving previous translation', () => {
  const arrow = new Path('M 0 0 L 0 0', {
    left: 10,
    sniptaleType: 'arrow',
    top: 12,
  }) as any;

  applyArrowObjectState(
    arrow,
    settings,
    [
      { x: 0, y: 0 },
      { x: 15, y: 20 },
      { x: 30, y: 10 },
    ],
    () => ({ handle: {} as never })
  );

  expect(arrow.sniptaleArrowMode).toBe('curve');
  expect(arrow.sniptaleArrowControlX).toBe(15);
  expect(arrow.controls).toEqual({ handle: {} });
  expect(arrow.dirty).toBe(true);
  expect(arrow.left).toEqual(expect.any(Number));
  expect(arrow.top).toEqual(expect.any(Number));
});

it('applies fallback path and default translation when points are missing', () => {
  const arrow = new Path('M 0 0 L 0 0', {
    sniptaleType: 'arrow',
  }) as any;

  applyArrowObjectState(arrow, { ...settings, style: 'dash' }, [], () => ({}));

  expect(arrow.path).toEqual(expect.any(Array));
  expect(arrow.left).toEqual(expect.any(Number));
  expect(arrow.top).toEqual(expect.any(Number));
  expect(arrow.sniptaleArrowStartX).toBeUndefined();
  expect(arrow.dirty).toBe(true);
});
