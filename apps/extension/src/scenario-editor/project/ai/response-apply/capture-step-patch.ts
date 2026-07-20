import type { ScenarioAssetEntry } from '@sniptale/runtime-contracts/scenario/types/session';
import type {
  ScenarioCaptureStep,
  ScenarioStepPatch,
} from '../../../../features/scenario/contracts/types/project';
import type { ScenarioEditorAIRequestedStepChange } from '../../../../contracts/ai/scenario';
import { MAX_SCENARIO_AI_ZOOM, MIN_SCENARIO_AI_ZOOM } from './constants';
import { clamp, isFiniteNumber } from './guards';
import {
  clampFocusPoint,
  createImageTransformForFocusPoint,
  isFinitePoint,
} from './focus-transform';
import { resolveOverlayPatch } from './overlay-patches';
import { createScenarioEditorAITextPatch } from './text-patch';

export function createCaptureStepPatch(args: {
  asset: ScenarioAssetEntry;
  requestedChange: ScenarioEditorAIRequestedStepChange;
  step: ScenarioCaptureStep;
}): ScenarioStepPatch {
  const patch: ScenarioStepPatch = {};
  const nextScale = isFiniteNumber(args.requestedChange.zoom)
    ? clamp(args.requestedChange.zoom, MIN_SCENARIO_AI_ZOOM, MAX_SCENARIO_AI_ZOOM)
    : args.step.imageTransform.scale;

  Object.assign(patch, createScenarioEditorAITextPatch(args.requestedChange));

  if (isFiniteNumber(args.requestedChange.zoom)) {
    patch.imageTransform = {
      ...args.step.imageTransform,
      scale: nextScale,
    };
  }

  if (isFinitePoint(args.requestedChange.focusPoint)) {
    patch.imageTransform = createImageTransformForFocusPoint({
      asset: args.asset,
      focusPoint: clampFocusPoint(args.step, args.requestedChange.focusPoint),
      scale: nextScale,
      step: args.step,
    });
  }

  const overlayPatch = resolveOverlayPatch(args.step, args.requestedChange);
  if (overlayPatch?.overlays) {
    patch.overlays = overlayPatch.overlays;
  }

  return patch;
}
