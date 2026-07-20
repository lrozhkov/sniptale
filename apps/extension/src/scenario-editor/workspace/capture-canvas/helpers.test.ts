// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  SCENARIO_STAGE_HEIGHT,
  SCENARIO_STAGE_WIDTH,
} from '../../../features/scenario/stage/layout';
import { createScenarioCaptureStep } from '../../../features/scenario/project/public';
import type { ScenarioCaptureStep } from '../../../features/scenario/contracts/types/project';
import {
  applyWorkspaceDragPatch,
  createWorkspaceResetPatch,
  resolveWorkspaceStagePoint,
} from './helpers';

function verifiesWorkspaceResetPatch() {
  expect(createWorkspaceResetPatch()).toEqual({
    imageTransform: { scale: 1, x: 0, y: 0 },
    viewportTransform: {
      x: 0,
      y: 0,
      width: SCENARIO_STAGE_WIDTH,
      height: SCENARIO_STAGE_HEIGHT,
    },
  });
}

function verifiesResolvedStagePoints() {
  expect(resolveWorkspaceStagePoint({ current: null }, { clientX: 10, clientY: 10 })).toBe(null);

  const stage = document.createElement('div');
  Object.defineProperty(stage, 'getBoundingClientRect', {
    value: () => ({
      left: 100,
      top: 50,
      width: 200,
      height: 100,
      right: 300,
      bottom: 150,
      x: 100,
      y: 50,
      toJSON: () => null,
    }),
  });

  expect(resolveWorkspaceStagePoint({ current: stage }, { clientX: 500, clientY: 0 })).toEqual({
    x: SCENARIO_STAGE_WIDTH,
    y: 0,
  });
}

function verifiesScaledPanDragPatch() {
  const snapshot: ScenarioCaptureStep = {
    ...createScenarioCaptureStep({
      assetId: 'asset-1',
    }),
    imageTransform: { scale: 1, x: 12, y: 24 },
  };

  expect(
    applyWorkspaceDragPatch({
      dragState: {
        origin: { x: 10, y: 20 },
        snapshot,
      },
      scale: 0.5,
      event: { clientX: 20, clientY: 30 },
    })
  ).toEqual({
    imageTransform: {
      scale: 1,
      x: 32,
      y: 44,
    },
  });
}

function runScenarioWorkspaceCaptureCanvasHelpersSuite() {
  it(
    'creates a reset patch that restores the canonical preview transform',
    verifiesWorkspaceResetPatch
  );
  it(
    'returns null when the stage bounds are unavailable and clamps resolved pointer coordinates',
    verifiesResolvedStagePoints
  );
  it('applies pan drag deltas in unscaled stage coordinates', verifiesScaledPanDragPatch);
}

describe(
  'scenario workspace capture canvas helpers',
  runScenarioWorkspaceCaptureCanvasHelpersSuite
);
