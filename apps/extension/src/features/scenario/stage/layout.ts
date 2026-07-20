import type { ScenarioCaptureStep } from '../contracts/types/project';
import { resolveScenarioImageRect } from './layout.image.ts';
import {
  SCENARIO_STAGE_HEIGHT,
  SCENARIO_STAGE_WIDTH,
  resolveScenarioSourceViewport,
  resolveScenarioViewport,
} from './layout.viewport.ts';
export {
  createDefaultScenarioViewportTransform,
  SCENARIO_STAGE_HEIGHT,
  SCENARIO_STAGE_WIDTH,
} from './layout.viewport.ts';
export type {
  ScenarioAssetDimensions,
  ScenarioStageLayout,
  ScenarioStageRenderMode,
} from './layout.types.ts';
import type {
  ScenarioAssetDimensions,
  ScenarioStageLayout,
  ScenarioStageRenderMode,
  ScenarioStageSize,
} from './layout.types.ts';

/**
 * Resolves the current viewport and image placement inside the fixed scenario canvas.
 */
export function resolveScenarioStageLayout(
  step: ScenarioCaptureStep,
  asset: ScenarioAssetDimensions,
  canvas: ScenarioStageSize = {
    width: SCENARIO_STAGE_WIDTH,
    height: SCENARIO_STAGE_HEIGHT,
  },
  renderMode: ScenarioStageRenderMode = 'editor'
): ScenarioStageLayout {
  const { normalizedViewport, viewport } = resolveScenarioViewport({
    asset,
    canvas,
    renderMode,
    stepViewportTransform: step.viewportTransform,
  });

  return {
    canvas,
    viewport,
    imageRect: resolveScenarioImageRect({
      asset,
      imageTransform: step.imageTransform,
      normalizedViewport,
      renderMode,
      viewport,
    }),
    sourceViewport: resolveScenarioSourceViewport(step, asset),
  };
}
