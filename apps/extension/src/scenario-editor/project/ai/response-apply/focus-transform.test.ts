import { expect, it } from 'vitest';

import { createScenarioCaptureStep } from '../../../../features/scenario/project/public';
import { clampFocusPoint, createImageTransformForFocusPoint } from './focus-transform';

function createCaptureStep() {
  return createScenarioCaptureStep({
    assetId: 'asset-1',
    page: {
      title: 'Dashboard',
      url: 'https://example.com/dashboard',
      viewport: { x: 0, y: 0, width: 1000, height: 800 },
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
    },
    title: 'Open dashboard',
  });
}

it('clamps the focus point within the step viewport', () => {
  const step = createCaptureStep();
  expect(clampFocusPoint(step, { x: 1400, y: -20 })).toEqual({ x: 1000, y: 0 });
});

it('projects focus transforms with clamped zoom and numeric offsets', () => {
  const step = createCaptureStep();
  const transform = createImageTransformForFocusPoint({
    asset: { width: 1000, height: 800 },
    focusPoint: { x: 1000, y: 0 },
    scale: 8,
    step,
  });

  expect(transform.scale).toBe(3);
  expect(transform.x).toBeTypeOf('number');
  expect(transform.y).toBeTypeOf('number');
});
