import { Path } from 'fabric';
import { expect, it } from 'vitest';
import { applyArrowObjectState } from './state';

it('derives legacy dynamic width metadata when new arrow flags are absent', () => {
  const arrow = new Path('M 0 0 L 0 0') as any;

  applyArrowObjectState(
    arrow,
    {
      color: '#123456',
      endHead: 'triangle',
      mode: 'straight',
      opacity: 0.6,
      shadow: 0,
      startHead: 'none',
      variant: 'tapered',
      width: 4,
    } as never,
    [
      { x: 1, y: 2 },
      { x: 10, y: 11 },
    ],
    () => ({ endpoint: {} as never })
  );

  expect(arrow.sniptaleArrowType).toBe('sharp');
  expect(arrow.sniptaleArrowDynamicWidth).toBe(true);
  expect(arrow.sniptaleArrowVariant).toBe('tapered');
  expect(arrow.controls).toEqual({ endpoint: {} });
  expect(typeof arrow.setCoords).toBe('function');
});
