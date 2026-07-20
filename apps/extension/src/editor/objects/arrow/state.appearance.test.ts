import { Path } from 'fabric';
import { expect, it } from 'vitest';

import { applyArrowObjectState } from './state';
import type { ArrowPathInstance } from './controls.types';

it('persists line style and sketch parameters while hiding controls during drawing', () => {
  const arrow = new Path('M 0 0 L 1 1') as ArrowPathInstance;
  arrow.sniptaleType = 'arrow';
  arrow.sniptaleArrowDrawing = true;

  applyArrowObjectState(
    arrow,
    {
      arrowType: 'sharp',
      bowing: 1.5,
      color: '#ff671d',
      dynamicWidth: false,
      endHead: 'triangle',
      endHeadSize: 3,
      mode: 'straight',
      opacity: 0.75,
      roughness: 2,
      shadow: 0,
      startHead: 'arrow',
      startHeadSize: 2,
      style: 'dash',
      variant: 'standard',
      width: 8,
    } as never,
    [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
    ],
    () => ({})
  );

  expect(arrow.sniptaleArrowStyle).toBe('dash');
  expect(arrow.sniptaleArrowRoughness).toBe(2);
  expect(arrow.sniptaleArrowBowing).toBe(1.5);
  expect(arrow.sniptaleArrowStartHeadSize).toBe(2);
  expect(arrow.sniptaleArrowEndHeadSize).toBe(3);
  expect(arrow.fill).toBe('transparent');
  expect(arrow.strokeDashArray).toEqual(expect.arrayContaining([expect.any(Number)]));
  expect(arrow.hasBorders).toBe(false);
  expect(arrow.hasControls).toBe(false);
  expect(arrow.lockScalingX).toBe(true);
});

it('falls back to solid style and zero sketch parameters in point edit mode', () => {
  const arrow = new Path('M 0 0 L 1 1') as ArrowPathInstance;
  arrow.sniptaleType = 'arrow';
  arrow.sniptaleArrowEditMode = true;

  applyArrowObjectState(
    arrow,
    {
      arrowType: 'sharp',
      color: '#ff671d',
      dynamicWidth: false,
      endHead: 'triangle',
      mode: 'straight',
      opacity: 1,
      shadow: 0,
      startHead: 'none',
      variant: 'standard',
      width: 4,
    } as never,
    [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
    ],
    () => ({})
  );

  expect(arrow.sniptaleArrowStyle).toBe('solid');
  expect(arrow.sniptaleArrowRoughness).toBe(0);
  expect(arrow.sniptaleArrowBowing).toBe(0);
  expect(arrow.stroke).toBe('transparent');
  expect(arrow.strokeWidth).toBe(0);
  expect(arrow.hasControls).toBe(true);
  expect(arrow.lockScalingX).toBe(true);
});
