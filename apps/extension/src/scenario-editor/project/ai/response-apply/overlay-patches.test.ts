import { expect, it } from 'vitest';

import { createScenarioCaptureStep } from '../../../../features/scenario/project/public';
import { resolveOverlayPatch } from './overlay-patches';

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

it('supports replace, append, clear, and undefined overlay modes', () => {
  const step = createCaptureStep();
  step.overlays = [{ id: 'overlay-1', kind: 'click-ring', point: { x: 10, y: 12 } }];

  expect(resolveOverlayPatch(step, { stepId: step.id, annotationsMode: 'clear' })).toEqual({
    overlays: [],
  });
  expect(
    resolveOverlayPatch(step, {
      stepId: step.id,
      annotationsMode: 'append',
      annotations: [{ tool: 'text', point: { x: 40, y: 50 }, text: 'CTA' }],
    })?.overlays
  ).toHaveLength(2);
  expect(
    resolveOverlayPatch(step, {
      stepId: step.id,
      annotationsMode: 'replace',
      annotations: [{ tool: 'text', point: { x: 40, y: 50 }, text: 'CTA' }],
    })?.overlays
  ).toHaveLength(1);
  expect(resolveOverlayPatch(step, { stepId: step.id } as never)).toBeNull();
});
