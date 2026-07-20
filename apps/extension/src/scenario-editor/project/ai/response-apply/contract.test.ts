import { expect, it } from 'vitest';

import { createScenarioCaptureStep } from '../../../../features/scenario/project/public';
import { type ScenarioProject } from '../../../../features/scenario/contracts/types/project';
import { applyScenarioEditorAIResponse } from './response/apply';

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

function createAssetsById() {
  return new Map([['asset-1', createAssetRecord()]]);
}

function getCaptureStep(project: ScenarioProject) {
  const captureStep = project.steps.find((step) => step.kind === 'capture');
  if (!captureStep) {
    throw new Error('Expected capture step');
  }
  return captureStep;
}

function createProject() {
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

  return {
    version: 2,
    id: 'project-1',
    name: 'Scenario',
    createdAt: 1,
    updatedAt: 1,
    trash: [],
    suggestedEvents: [],
    steps: [
      captureStep,
      {
        id: 'step-note',
        kind: 'note',
        title: 'Note',
        body: 'Legacy note',
        tone: 'neutral',
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  } satisfies ScenarioProject;
}

it('maps zoom and focus point into deterministic capture step patches', () => {
  const project = createProject();
  const captureStep = getCaptureStep(project);

  const patches = applyScenarioEditorAIResponse({
    assetsById: createAssetsById(),
    project,
    steps: [
      {
        stepId: captureStep.id,
        title: 'Focus CTA',
        zoom: 8,
        focusPoint: { x: 1400, y: -20 },
      },
    ],
  });

  expect(patches).toHaveLength(1);
  expect(patches[0]).toMatchObject({
    stepId: captureStep.id,
    patch: {
      title: 'Focus CTA',
      imageTransform: {
        scale: 3,
      },
    },
  });
  expect(patches[0]?.patch.imageTransform?.x).toBeTypeOf('number');
  expect(patches[0]?.patch.imageTransform?.y).toBeTypeOf('number');
});

it('applies overlay modes and skips unknown step ids without failing the whole batch', () => {
  const project = createProject();
  const captureStep = getCaptureStep(project);

  const patches = applyScenarioEditorAIResponse({
    assetsById: createAssetsById(),
    project,
    steps: [
      { stepId: 'missing-step', title: 'Ignored' },
      {
        stepId: captureStep.id,
        annotationsMode: 'replace',
        annotations: [
          { tool: 'focus-rect', rect: { x: 120, y: 80, width: 200, height: 140 } },
          { tool: 'text', point: { x: 140, y: 70 }, text: 'Search' },
        ],
      },
    ],
  });

  expect(patches).toHaveLength(1);
  expect(patches[0]?.patch.overlays).toHaveLength(2);
});

it('applies text patches to non-capture steps in the same response contract', () => {
  const patches = applyScenarioEditorAIResponse({
    assetsById: createAssetsById(),
    project: createProject(),
    steps: [{ stepId: 'step-note', body: 'Updated note copy' }],
  });

  expect(patches).toEqual([
    {
      stepId: 'step-note',
      patch: { body: 'Updated note copy' },
    },
  ]);
});

it('keeps text-only capture edits when the asset is missing', () => {
  const project = createProject();
  const captureStep = getCaptureStep(project);
  captureStep.overlays = [{ id: 'overlay-1', kind: 'click-ring', point: { x: 10, y: 12 } }];

  const patches = applyScenarioEditorAIResponse({
    assetsById: new Map(),
    project,
    steps: [
      {
        stepId: captureStep.id,
        title: 'Still editable without asset',
        body: 'Text only patch',
        annotationsMode: 'clear',
      },
      { stepId: 'step-note', title: 'Note title' },
    ],
  });

  expect(patches).toEqual([
    {
      stepId: captureStep.id,
      patch: {
        body: 'Text only patch',
        title: 'Still editable without asset',
      },
    },
    {
      stepId: 'step-note',
      patch: { title: 'Note title' },
    },
  ]);
});

it('supports append and clear overlay modes', () => {
  const project = createProject();
  const captureStep = getCaptureStep(project);
  captureStep.overlays = [{ id: 'overlay-1', kind: 'click-ring', point: { x: 10, y: 12 } }];

  const patches = applyScenarioEditorAIResponse({
    assetsById: createAssetsById(),
    project,
    steps: [
      {
        stepId: captureStep.id,
        annotationsMode: 'append',
        annotations: [{ tool: 'text', point: { x: 40, y: 50 }, text: 'CTA' }],
      },
      { stepId: captureStep.id, annotationsMode: 'clear' },
    ],
  });

  expect(patches[0]?.patch.overlays).toHaveLength(2);
  expect(patches[1]).toEqual({
    stepId: captureStep.id,
    patch: { overlays: [] },
  });
});

it('drops no-op requested changes after guardrails are applied', () => {
  const project = createProject();
  const captureStep = getCaptureStep(project);

  const patches = applyScenarioEditorAIResponse({
    assetsById: createAssetsById(),
    project,
    steps: [
      { stepId: captureStep.id, focusPoint: { x: Number.NaN, y: 10 } },
      { stepId: captureStep.id, zoom: Number.NaN },
    ],
  });

  expect(patches).toEqual([]);
});
