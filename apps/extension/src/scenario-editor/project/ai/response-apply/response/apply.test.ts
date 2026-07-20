import { expect, it } from 'vitest';

import { createScenarioCaptureStep } from '../../../../../features/scenario/project/public';
import { applyScenarioEditorAIResponse } from './apply';

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

it('keeps the apply contract intact', () => {
  const captureStep = createScenarioCaptureStep({
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

  const project = {
    version: 2,
    id: 'project-1',
    name: 'Scenario',
    createdAt: 1,
    updatedAt: 1,
    trash: [],
    suggestedEvents: [],
    steps: [captureStep],
  } as const;

  const patches = applyScenarioEditorAIResponse({
    assetsById: new Map([['asset-1', createAssetRecord()]]),
    project: project as never,
    steps: [{ stepId: captureStep.id, zoom: 8, focusPoint: { x: 1400, y: -20 } }],
  });

  expect(patches).toHaveLength(1);
  expect(patches[0]).toMatchObject({
    stepId: captureStep.id,
    patch: {
      imageTransform: {
        scale: 3,
      },
    },
  });
});

it('skips missing steps and empty text-only patches', () => {
  const patches = applyScenarioEditorAIResponse({
    assetsById: new Map(),
    project: {
      version: 2,
      id: 'project-1',
      name: 'Scenario',
      createdAt: 1,
      updatedAt: 1,
      trash: [],
      suggestedEvents: [],
      steps: [],
    } as never,
    steps: [{ stepId: 'missing-step', title: 'Unused' }, { stepId: 'missing-step-2' }],
  });

  expect(patches).toEqual([]);
});
