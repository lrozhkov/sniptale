import { expect, it } from 'vitest';
import { buildVideoProjectDraftFromScenarioProject } from './draft';
import { type ScenarioProject } from '../../features/scenario/contracts/types/project';
import {
  createScenarioCaptureStep,
  createScenarioProject as createScenarioProjectBase,
} from '../../features/scenario/project/public';
import {
  VideoCursorAnimationPreset,
  VideoCursorVisualPreset,
} from '../../features/video/project/types/index';

function createScenarioProject(): ScenarioProject {
  const project = createScenarioProjectBase('Scenario demo');
  const firstCapture = createFirstCaptureStep();
  const secondCapture = createSecondCaptureStep();

  return {
    ...project,
    id: 'scenario-1',
    createdAt: 10,
    updatedAt: 20,
    steps: [firstCapture, secondCapture],
    suggestedEvents: [
      {
        id: 'event-1',
        kind: 'scroll',
        status: 'pending',
        createdAt: 50,
        message: 'Scroll to reveal more items',
        sourceStepId: 'capture-2',
        target: null,
        data: {},
      },
    ],
  };
}

function createFirstCaptureStep() {
  return {
    ...createScenarioCaptureStep({
      assetId: 'asset-1',
      title: 'Open dashboard',
      interactionPoint: { x: 640, y: 360 },
      cursorPoint: { x: 620, y: 340 },
    }),
    id: 'capture-1',
    createdAt: 10,
    updatedAt: 20,
  };
}

function createSecondCaptureStep() {
  return {
    ...createScenarioCaptureStep({
      assetId: 'asset-2',
      title: 'Scroll feed',
      cursorPoint: { x: 800, y: 420 },
      overlays: [
        {
          id: 'click-1',
          kind: 'click-ring',
          point: { x: 810, y: 430 },
        },
      ],
    }),
    id: 'capture-2',
    createdAt: 30,
    updatedAt: 40,
  };
}

function createEmptyScenarioProject() {
  const project = createScenarioProjectBase('Empty scenario');

  return {
    ...project,
    id: 'scenario-empty',
    createdAt: 1,
    updatedAt: 2,
  };
}

function createDraftAssets() {
  return {
    'asset-1': {
      createdAt: 10,
      height: 1080,
      mimeType: 'image/png',
      name: 'Dashboard',
      size: 100,
      width: 1920,
    },
    'asset-2': {
      createdAt: 30,
      height: 1080,
      mimeType: 'image/png',
      name: 'Feed',
      size: 120,
      width: 1920,
    },
  };
}

it('materializes a scenario draft into a video project with scenario assets and interaction tracks', () => {
  const draft = buildVideoProjectDraftFromScenarioProject({
    project: createScenarioProject(),
    assets: createDraftAssets(),
    width: 1280,
    height: 720,
    stepDuration: 4,
  });

  expect(draft.source).toEqual({
    kind: 'scenario',
    scenarioProjectId: 'scenario-1',
  });
  expect(draft.assets.map((asset) => asset.source.kind)).toEqual([
    'scenario-asset',
    'scenario-asset',
  ]);
  expect(draft.clips).toHaveLength(2);
  expect(draft.cursorTrack?.samples).toHaveLength(4);
  expect(draft.cursorTrack?.skin).toEqual({
    animationPreset: VideoCursorAnimationPreset.BREATHE,
    color: '#38bdf8',
    hidden: false,
    preset: VideoCursorVisualPreset.RING,
    scale: 1.18,
    shadow: true,
  });
  expect(draft.actionEvents.map((event) => event.preset)).toEqual(['CLICK_RIPPLE', 'CLICK_RIPPLE']);
});

it('creates an empty draft when the scenario has no capture steps', () => {
  const draft = buildVideoProjectDraftFromScenarioProject({
    project: createEmptyScenarioProject(),
    assets: {},
    width: 1280,
    height: 720,
  });

  expect(draft.source).toEqual({
    kind: 'scenario',
    scenarioProjectId: 'scenario-empty',
  });
  expect(draft.clips).toEqual([]);
  expect(draft.cursorTrack).toBeNull();
  expect(draft.actionEvents).toEqual([]);
});
