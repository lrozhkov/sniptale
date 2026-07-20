import { expect, it } from 'vitest';

import { createScenarioCaptureStep } from '../../../../features/scenario/project/public';
import { createCaptureStepPatch } from './capture-step-patch';

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

function createAssetRecord() {
  return {
    id: 'asset-1',
    projectId: 'project-1',
    galleryAssetId: null,
    createdAt: 1,
    mimeType: 'image/png',
    size: 100,
    width: 1000,
    height: 800,
  };
}

it('assembles text, zoom, focus, and overlay patches for capture steps', () => {
  const step = createCaptureStep();
  const patch = createCaptureStepPatch({
    asset: createAssetRecord(),
    requestedChange: {
      stepId: step.id,
      title: 'Focus CTA',
      body: 'Body copy',
      zoom: 8,
      focusPoint: { x: 1400, y: -20 },
      annotationsMode: 'replace',
      annotations: [{ tool: 'text', point: { x: 40, y: 50 }, text: 'CTA' }],
    } as never,
    step,
  });

  expect(patch.title).toBe('Focus CTA');
  expect(patch.body).toBe('Body copy');
  expect(patch.imageTransform?.scale).toBe(3);
  expect(patch.overlays).toHaveLength(1);
});
