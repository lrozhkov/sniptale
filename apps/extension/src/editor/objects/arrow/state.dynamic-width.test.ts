import { Path } from 'fabric';
import { expect, it } from 'vitest';
import { applyArrowObjectState } from './state';

function applyState(dynamicWidth: boolean | undefined, variant: 'standard' | 'tapered') {
  const arrow = new Path('M 0 0 L 0 0') as any;
  applyArrowObjectState(
    arrow,
    {
      color: '#123456',
      endHead: 'triangle',
      mode: 'straight',
      opacity: 1,
      shadow: 0,
      startHead: 'none',
      variant,
      width: 4,
      ...(dynamicWidth === undefined ? {} : { dynamicWidth }),
    } as never,
    [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ],
    () => ({})
  );
  return arrow;
}

it('stores dynamic width independently from legacy tapered variants', () => {
  expect(applyState(true, 'standard')).toMatchObject({
    sniptaleArrowDynamicWidth: true,
    sniptaleArrowVariant: 'standard',
  });
  expect(applyState(false, 'tapered')).toMatchObject({
    sniptaleArrowDynamicWidth: false,
    sniptaleArrowVariant: 'tapered',
  });
  expect(applyState(undefined, 'standard')).toMatchObject({
    sniptaleArrowDynamicWidth: false,
    sniptaleArrowVariant: 'standard',
  });
});
